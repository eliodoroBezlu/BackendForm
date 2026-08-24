import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SolicitudPrestamo,
  EstadoSolicitud,
} from './schemas/solicitud-prestamo.schema';
import { PrestamoSpcc, EstadoPrestamo } from './schemas/prestamo-spcc.schema';

export interface ResumenPrestamos {
  disponibles: number;
  enPrestamo: number;
  porEntregar: number;
  vencidos: number;
  cerradosEsteAnio: number;
  fueraDeServicio: number;
}

export interface FilaVencido {
  numero: string;
  area: string;
  solicitante: string;
  fechaDevolucionPrevista: Date;
  diasDeAtraso: number;
  equiposFuera: number;
}

export interface FilaPorArea {
  area: string;
  prestamos: number;
  equiposFuera: number;
  vencidos: number;
}

export interface FilaEquipo {
  codigo: string;
  descripcion: string;
  tipoEquipo: string;
  veces: number;
  ultimoPrestamo?: Date;
}

export interface FilaSinInspeccion {
  codigo: string;
  descripcion: string;
  area: string;
  numero: string;
  desde: Date;
}

const DIA = 1000 * 60 * 60 * 24;

/**
 * Reportes del préstamo.
 *
 * Todo se deriva de las líneas y las cabeceras; no hay contadores guardados que
 * mantener sincronizados.
 */
@Injectable()
export class PrestamosReportesService {
  constructor(
    @InjectModel(SolicitudPrestamo.name)
    private readonly solicitudes: Model<SolicitudPrestamo>,
    @InjectModel(PrestamoSpcc.name)
    private readonly prestamos: Model<PrestamoSpcc>,
  ) {}

  private diasDeAtraso(limite: Date): number {
    const fin = new Date(limite);
    fin.setHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((Date.now() - fin.getTime()) / DIA));
  }

  async resumen(disponibles: number): Promise<ResumenPrestamos> {
    const inicioAnio = new Date(new Date().getFullYear(), 0, 1);

    const [enPrestamo, porEntregar, entregadas, cerradosEsteAnio, fuera] =
      await Promise.all([
        this.prestamos.countDocuments({ estado: EstadoPrestamo.ENTREGADO }),
        this.solicitudes.countDocuments({ estado: EstadoSolicitud.SOLICITADA }),
        this.solicitudes
          .find({ estado: EstadoSolicitud.ENTREGADA })
          .select('fechaDevolucionPrevista')
          .lean<{ fechaDevolucionPrevista: Date }[]>()
          .exec(),
        this.solicitudes.countDocuments({
          estado: EstadoSolicitud.CERRADA,
          fechaCierre: { $gte: inicioAnio },
        }),
        this.prestamos.countDocuments({
          estado: EstadoPrestamo.DEVUELTO,
          'devolucion.estado': { $ne: 'operativo' },
        }),
      ]);

    return {
      disponibles,
      enPrestamo,
      porEntregar,
      vencidos: entregadas.filter(
        (s) => this.diasDeAtraso(s.fechaDevolucionPrevista) > 0,
      ).length,
      cerradosEsteAnio,
      fueraDeServicio: fuera,
    };
  }

  /** Préstamos que pasaron su plazo y siguen fuera. */
  async vencidos(): Promise<FilaVencido[]> {
    const abiertas = await this.solicitudes
      .find({ estado: EstadoSolicitud.ENTREGADA })
      .lean<SolicitudPrestamo[]>()
      .exec();

    const filas: FilaVencido[] = [];
    for (const s of abiertas) {
      const dias = this.diasDeAtraso(s.fechaDevolucionPrevista);
      if (dias <= 0) continue;

      filas.push({
        numero: s.numero,
        area: s.areaSolicitante,
        solicitante: s.solicitanteNombre ?? s.solicitanteUsername,
        fechaDevolucionPrevista: s.fechaDevolucionPrevista,
        diasDeAtraso: dias,
        equiposFuera: await this.prestamos.countDocuments({
          solicitud: s._id,
          estado: EstadoPrestamo.ENTREGADO,
        }),
      });
    }

    // Lo más atrasado primero: es lo que hay que reclamar antes.
    return filas.sort((a, b) => b.diasDeAtraso - a.diasDeAtraso);
  }

  async porArea(): Promise<FilaPorArea[]> {
    const solicitudes = await this.solicitudes
      .find({ estado: { $ne: EstadoSolicitud.CANCELADA } })
      .lean<SolicitudPrestamo[]>()
      .exec();

    const mapa = new Map<string, FilaPorArea>();
    for (const s of solicitudes) {
      const fila = mapa.get(s.areaSolicitante) ?? {
        area: s.areaSolicitante,
        prestamos: 0,
        equiposFuera: 0,
        vencidos: 0,
      };
      fila.prestamos += 1;
      if (s.estado === EstadoSolicitud.ENTREGADA) {
        fila.equiposFuera += await this.prestamos.countDocuments({
          solicitud: s._id,
          estado: EstadoPrestamo.ENTREGADO,
        });
        if (this.diasDeAtraso(s.fechaDevolucionPrevista) > 0)
          fila.vencidos += 1;
      }
      mapa.set(s.areaSolicitante, fila);
    }

    return [...mapa.values()].sort((a, b) => b.prestamos - a.prestamos);
  }

  /** Los que más salen: candidatos a reponer o a revisar antes. */
  async masPrestados(limite = 20): Promise<FilaEquipo[]> {
    return this.prestamos.aggregate<FilaEquipo>([
      { $match: { estado: { $ne: EstadoPrestamo.CANCELADO } } },
      {
        $group: {
          _id: '$equipo',
          codigo: { $first: '$codigo' },
          descripcion: { $first: '$descripcion' },
          tipoEquipo: { $first: '$tipoEquipo' },
          veces: { $sum: 1 },
          ultimoPrestamo: { $max: '$createdAt' },
        },
      },
      { $sort: { veces: -1, codigo: 1 } },
      { $limit: limite },
      { $project: { _id: 0 } },
    ]);
  }

  async historialEquipo(codigo: string): Promise<PrestamoSpcc[]> {
    return this.prestamos
      .find({ codigo })
      .sort({ createdAt: -1 })
      .lean<PrestamoSpcc[]>()
      .exec();
  }

  /**
   * Equipos que están fuera y **nunca se inspeccionaron desde que salieron**.
   *
   * Es el reporte que da sentido al resto: un SPCC guardado está en espera,
   * pero uno prestado se va a usar, y usarlo sin inspección es justo lo que la
   * lista de chequeo existe para evitar.
   */
  async sinInspeccion(): Promise<FilaSinInspeccion[]> {
    const fuera = await this.prestamos
      .find({ estado: EstadoPrestamo.ENTREGADO })
      .lean<PrestamoSpcc[]>()
      .exec();

    if (fuera.length === 0) return [];

    const cabeceras = await this.solicitudes
      .find({ _id: { $in: fuera.map((l) => l.solicitud) } })
      .lean<SolicitudPrestamo[]>()
      .exec();
    const porId = new Map(cabeceras.map((s) => [String(s._id), s]));

    const inspecciones = this.prestamos.db.collection(
      'inspections_herra_equipos',
    );

    const filas: FilaSinInspeccion[] = [];
    for (const linea of fuera) {
      const cabecera = porId.get(String(linea.solicitud));
      const desde = cabecera?.entrega?.fecha ?? cabecera?.fechaSolicitud;
      if (!desde) continue;

      const inspeccionada = await inspecciones.countDocuments({
        codigoEquipo: linea.codigo,
        createdAt: { $gte: desde },
      });
      if (inspeccionada > 0) continue;

      filas.push({
        codigo: linea.codigo,
        descripcion: linea.descripcion,
        area: cabecera?.areaSolicitante ?? '—',
        numero: cabecera?.numero ?? '—',
        desde,
      });
    }

    return filas.sort((a, b) => a.desde.getTime() - b.desde.getTime());
  }
}
