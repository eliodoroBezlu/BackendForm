import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Equipo } from '../equipos/schemas/equipo.schema';
import { ESPECIFICACION_BOMBA, TIPO_EQUIPO_BOMBA } from './domain/bomba';
import { EstadoReporte } from './domain/reporte';
import {
  compararUrgencia,
  SituacionBomba,
  situacionDeBomba,
  UltimoReporte,
} from './domain/situacion-bomba';
import { ComponenteEquipo } from './schemas/componente-equipo.schema';
import { IntervencionEquipo } from './schemas/intervencion-equipo.schema';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';

export interface BombaResumen {
  equipo: Equipo;
  /** Las piezas montadas hoy. */
  componentes: ComponenteEquipo[];
  ultimaIntervencion?: IntervencionEquipo;
  /** Próximo monitoreo y fecha tentativa, según el último reporte emitido. */
  situacion: SituacionBomba;
}

export interface FichaBomba {
  equipo: Equipo;
  /** Montadas hoy y retiradas, de la más reciente a la más antigua por pieza. */
  componentes: ComponenteEquipo[];
  intervenciones: IntervencionEquipo[];
  /** Todos sus reportes, de cualquier estado, del más reciente al más antiguo. */
  reportes: ReporteMonitoreo[];
  situacion: SituacionBomba;
}

/** Lo que la lista y el historial necesitan de un reporte; los antecedentes pesan. */
const CAMPOS_DE_REPORTE =
  'tag fecha tecnica resultado estado codigo_interno elaboradoPor revisadoPor emitidoEn antecedentes.fecha_tentativa antecedentes.horas_restantes';

/** La frecuencia de la ficha: el panel de inventario puede guardarla como texto. */
function frecuenciaDe(equipo: Equipo): number | undefined {
  const v = (equipo.especificaciones as Record<string, unknown> | undefined)?.[
    ESPECIFICACION_BOMBA.frecuencia
  ];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function ultimoDe(r: ReporteMonitoreo | undefined): UltimoReporte | undefined {
  if (!r) return undefined;
  return {
    id: String(r._id),
    codigo_interno: r.codigo_interno,
    fecha: r.fecha,
    resultado: r.resultado,
    fecha_tentativa: r.antecedentes?.fecha_tentativa
      ? new Date(r.antecedentes.fecha_tentativa)
      : undefined,
    horas_restantes: r.antecedentes?.horas_restantes,
  };
}

/** Las bombas del inventario con lo que el reporte necesita de cada una. */
@Injectable()
export class BombasService {
  constructor(
    @InjectModel(Equipo.name) private readonly equipoModel: Model<Equipo>,
    @InjectModel(ComponenteEquipo.name)
    private readonly componenteModel: Model<ComponenteEquipo>,
    @InjectModel(IntervencionEquipo.name)
    private readonly intervencionModel: Model<IntervencionEquipo>,
    @InjectModel(ReporteMonitoreo.name)
    private readonly reporteModel: Model<ReporteMonitoreo>,
  ) {}

  /** Ordenadas por urgencia: lo vencido primero. */
  async listar(hoy = new Date()): Promise<BombaResumen[]> {
    const equipos = await this.equipoModel
      .find({ tipo_equipo: TIPO_EQUIPO_BOMBA })
      .sort({ codigo: 1 })
      .lean<Equipo[]>()
      .exec();
    if (equipos.length === 0) return [];

    const ids = equipos.map((e) => e._id as Types.ObjectId);
    const [vigentes, intervenciones, emitidos] = await Promise.all([
      this.componenteModel
        .find({ equipo_id: { $in: ids }, vigente: true })
        .lean<ComponenteEquipo[]>()
        .exec(),
      this.intervencionModel
        .find({ equipo_id: { $in: ids } })
        .sort({ fecha: -1 })
        .lean<IntervencionEquipo[]>()
        .exec(),
      this.reporteModel
        .find({ equipo_id: { $in: ids }, estado: EstadoReporte.EMITIDO })
        .select(`equipo_id ${CAMPOS_DE_REPORTE}`)
        .sort({ fecha: -1, emitidoEn: -1 })
        .lean<ReporteMonitoreo[]>()
        .exec(),
    ]);

    const delEquipo = <T extends { equipo_id: Types.ObjectId }>(
      lista: T[],
      id: unknown,
    ) => lista.filter((x) => String(x.equipo_id) === String(id));

    return equipos
      .map((equipo) => ({
        equipo,
        componentes: delEquipo(vigentes, equipo._id),
        // Vienen ordenadas de la más reciente a la más antigua.
        ultimaIntervencion: delEquipo(intervenciones, equipo._id)[0],
        situacion: situacionDeBomba(
          ultimoDe(delEquipo(emitidos, equipo._id)[0]),
          frecuenciaDe(equipo),
          hoy,
        ),
      }))
      .sort((a, b) => compararUrgencia(a.situacion, b.situacion));
  }

  async ficha(tag: string, hoy = new Date()): Promise<FichaBomba> {
    const equipo = await this.equipoModel
      .findOne({
        codigo: tag.trim().toUpperCase(),
        tipo_equipo: TIPO_EQUIPO_BOMBA,
      })
      .lean<Equipo>()
      .exec();
    if (!equipo) {
      throw new NotFoundException(`No hay una bomba ${tag} en el inventario`);
    }

    const [componentes, intervenciones, reportes] = await Promise.all([
      this.componenteModel
        .find({ equipo_id: equipo._id })
        .sort({ pieza: 1, vigente: -1, fecha_instalacion: -1 })
        .lean<ComponenteEquipo[]>()
        .exec(),
      this.intervencionModel
        .find({ equipo_id: equipo._id })
        .sort({ fecha: -1 })
        .lean<IntervencionEquipo[]>()
        .exec(),
      this.reporteModel
        .find({ equipo_id: equipo._id })
        .select(CAMPOS_DE_REPORTE)
        .sort({ fecha: -1, createdAt: -1 })
        .lean<ReporteMonitoreo[]>()
        .exec(),
    ]);
    const ultimoEmitido = reportes.find(
      (r) => r.estado === EstadoReporte.EMITIDO,
    );
    return {
      equipo,
      componentes,
      intervenciones,
      reportes,
      situacion: situacionDeBomba(
        ultimoDe(ultimoEmitido),
        frecuenciaDe(equipo),
        hoy,
      ),
    };
  }
}
