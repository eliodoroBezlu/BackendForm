import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { marcarDadoDeBaja } from '../../common/baja-logica/baja-logica.plugin';
import { AntecedentesMonitoreoService } from './antecedentes-monitoreo.service';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { CorrelativosMonitoreoService } from './correlativos-monitoreo.service';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { PlantillasMonitoreoService } from './plantillas-monitoreo.service';
import { TIPO_EQUIPO_BOMBA } from './domain/bomba';
import {
  normalizarValor,
  TipoCatalogoMonitoreo,
} from './domain/catalogos-iniciales';
import {
  codigoInterno,
  EstadoReporte,
  faltantesParaEnviar,
} from './domain/reporte';
import { ValoresDeCatalogo } from './domain/valores-de-catalogo';
import {
  ActualizarReporteMonitoreoDto,
  CrearReporteMonitoreoDto,
  FiltrosReportesDto,
} from './dto/reporte-monitoreo.dto';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';

type Contenido = Omit<ActualizarReporteMonitoreoDto, 'fecha'>;

/**
 * Quita los `undefined` de un objeto antes de guardarlo como `Object`: el
 * driver los escribiría como `null`, y un antecedente «null» se leería como
 * un dato que se sabe vacío.
 */
function sinIndefinidos<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(sinIndefinidos) as T;
  if (
    valor &&
    typeof valor === 'object' &&
    !(valor instanceof Date) &&
    !(valor instanceof Types.ObjectId)
  ) {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, sinIndefinidos(v)]),
    ) as T;
  }
  return valor;
}

/**
 * El ciclo de vida del reporte: borrador → pendiente de revisión → emitido.
 *
 * - Solo quien lo elaboró edita, envía o da de baja su borrador.
 * - Lo revisa (devuelve o emite) **otra persona** con el rol: el formato
 *   tiene «Elaborado por» y «Revisado por», y en los ejemplos son distintas.
 */
@Injectable()
export class ReportesMonitoreoService {
  constructor(
    @InjectModel(ReporteMonitoreo.name)
    private readonly modelo: Model<ReporteMonitoreo>,
    private readonly antecedentes: AntecedentesMonitoreoService,
    private readonly archivos: ArchivosMonitoreoService,
    private readonly catalogos: MonitoreoCatalogosService,
    private readonly correlativos: CorrelativosMonitoreoService,
    private readonly plantillas: PlantillasMonitoreoService,
  ) {}

  listar(filtros: FiltrosReportesDto): Promise<ReporteMonitoreo[]> {
    const consulta: FilterQuery<ReporteMonitoreo> = {};
    if (filtros.tag) consulta.tag = filtros.tag.trim().toUpperCase();
    if (filtros.estado) consulta.estado = filtros.estado;
    if (filtros.tecnica) consulta.tecnica = filtros.tecnica;
    if (filtros.resultado) consulta.resultado = filtros.resultado;
    if (filtros.desde || filtros.hasta) {
      consulta.fecha = {
        ...(filtros.desde ? { $gte: new Date(filtros.desde) } : {}),
        ...(filtros.hasta ? { $lte: new Date(filtros.hasta) } : {}),
      };
    }
    return this.modelo
      .find(consulta)
      .select('-antecedentes -historial')
      .sort({ fecha: -1, createdAt: -1 })
      .exec();
  }

  async obtener(id: string): Promise<ReporteMonitoreo> {
    const reporte = await this.modelo.findById(id).exec();
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    return reporte;
  }

  async crear(
    dto: CrearReporteMonitoreoDto,
    usuario: string,
  ): Promise<ReporteMonitoreo> {
    const fecha = new Date(dto.fecha);
    const contenido = await this.contenidoValidado(dto);
    const prellenado = await this.antecedentes.armar(
      dto.tag,
      fecha,
      contenido.lecturas?.horas,
    );
    const plantilla = await this.plantillas.obtener(TIPO_EQUIPO_BOMBA);

    return this.modelo.create(
      sinIndefinidos({
        ...contenido,
        tipo_equipo: TIPO_EQUIPO_BOMBA,
        equipo_id: prellenado.equipo_id,
        tag: prellenado.tag,
        fecha,
        fotos_por_fila: plantilla.fotos_por_fila,
        antecedentes: prellenado.antecedentes,
        estado: EstadoReporte.BORRADOR,
        elaboradoPor: usuario,
        historial: [{ accion: 'creado', por: usuario, en: new Date() }],
      }),
    );
  }

  async actualizar(
    id: string,
    dto: ActualizarReporteMonitoreoDto,
    usuario: string,
  ): Promise<ReporteMonitoreo> {
    const reporte = await this.obtener(id);
    this.exigirBorradorPropio(reporte, usuario);

    const contenido = await this.contenidoValidado(dto, reporte);
    reporte.set(sinIndefinidos(contenido));
    if (dto.fecha) reporte.fecha = new Date(dto.fecha);
    await this.rehacerAntecedentes(reporte);
    return reporte.save();
  }

  async darDeBaja(id: string, usuario: string): Promise<ReporteMonitoreo> {
    const reporte = await this.obtener(id);
    this.exigirBorradorPropio(reporte, usuario);
    reporte.set(marcarDadoDeBaja(usuario));
    return reporte.save();
  }

  /** Exige lo que falta, toma los antecedentes por última vez y los congela. */
  async enviar(id: string, usuario: string): Promise<ReporteMonitoreo> {
    const reporte = await this.obtener(id);
    this.exigirBorradorPropio(reporte, usuario);

    const faltan = faltantesParaEnviar({
      tecnica: reporte.tecnica,
      resultado: reporte.resultado,
      alcance: reporte.alcance,
      analisis: reporte.analisis,
      recomendaciones: reporte.recomendaciones ?? [],
      tareas: reporte.tareas ?? [],
    });
    if (faltan.length > 0) {
      // Va en `message`: es lo único que el filtro de errores reenvía, y es
      // justo la lista que la pantalla tiene que mostrar.
      throw new BadRequestException({
        message: faltan.map(
          (f) => `Falta: ${f.charAt(0).toLowerCase()}${f.slice(1)}`,
        ),
      });
    }

    await this.rehacerAntecedentes(reporte);
    return this.transicion(reporte, EstadoReporte.BORRADOR, {
      $set: {
        estado: EstadoReporte.PENDIENTE_REVISION,
        antecedentes: reporte.antecedentes,
      },
      $push: { historial: { accion: 'enviado', por: usuario, en: new Date() } },
    });
  }

  async devolver(
    id: string,
    motivo: string,
    usuario: string,
  ): Promise<ReporteMonitoreo> {
    const reporte = await this.obtener(id);
    this.exigirRevisor(reporte, usuario);
    return this.transicion(reporte, EstadoReporte.PENDIENTE_REVISION, {
      $set: { estado: EstadoReporte.BORRADOR },
      $push: {
        historial: {
          accion: 'devuelto',
          por: usuario,
          en: new Date(),
          motivo: motivo.trim(),
        },
      },
    });
  }

  /**
   * Emite y numera. El número se reserva antes de cambiar el estado: si otro
   * revisor se adelanta, ese número queda sin usar (un hueco), que es mejor
   * que dos reportes con el mismo código o uno emitido sin código.
   */
  async emitir(id: string, usuario: string): Promise<ReporteMonitoreo> {
    const reporte = await this.obtener(id);
    this.exigirRevisor(reporte, usuario);

    const codigoTecnica = await this.codigoDeTecnica(reporte.tecnica);
    const anio = reporte.fecha.getUTCFullYear();
    const correlativo = await this.correlativos.siguiente(codigoTecnica, anio);
    const ahora = new Date();

    return this.transicion(reporte, EstadoReporte.PENDIENTE_REVISION, {
      $set: {
        estado: EstadoReporte.EMITIDO,
        codigo_interno: codigoInterno(codigoTecnica, correlativo),
        correlativo,
        revisadoPor: usuario,
        emitidoEn: ahora,
      },
      $push: { historial: { accion: 'emitido', por: usuario, en: ahora } },
    });
  }

  // ── Reglas ─────────────────────────────────────────────────────────────

  private exigirBorradorPropio(
    reporte: ReporteMonitoreo,
    usuario: string,
  ): void {
    if (reporte.estado !== EstadoReporte.BORRADOR) {
      throw new ConflictException('Solo se modifica un reporte en borrador');
    }
    if (reporte.elaboradoPor !== usuario) {
      throw new ForbiddenException(
        'Solo quien elaboró el reporte puede modificarlo',
      );
    }
  }

  private exigirRevisor(reporte: ReporteMonitoreo, usuario: string): void {
    if (reporte.estado !== EstadoReporte.PENDIENTE_REVISION) {
      throw new ConflictException('El reporte no está pendiente de revisión');
    }
    if (reporte.elaboradoPor === usuario) {
      throw new ForbiddenException(
        'Un reporte lo revisa alguien distinto de quien lo elaboró',
      );
    }
  }

  /** Cambia de estado solo si nadie lo cambió entre la lectura y la escritura. */
  private async transicion(
    reporte: ReporteMonitoreo,
    desde: EstadoReporte,
    cambio: Record<string, unknown>,
  ): Promise<ReporteMonitoreo> {
    const actualizado = await this.modelo
      .findOneAndUpdate({ _id: reporte._id, estado: desde }, cambio, {
        new: true,
      })
      .exec();
    if (!actualizado) {
      throw new ConflictException(
        'Otra persona cambió el estado del reporte; recárguelo',
      );
    }
    return actualizado;
  }

  private async rehacerAntecedentes(reporte: ReporteMonitoreo): Promise<void> {
    const { antecedentes } = await this.antecedentes.armar(
      reporte.tag,
      reporte.fecha,
      reporte.lecturas?.horas,
      reporte._id as Types.ObjectId,
    );
    reporte.set('antecedentes', sinIndefinidos(antecedentes));
  }

  private async codigoDeTecnica(tecnica?: string): Promise<string> {
    const entradas = await this.catalogos.listar(
      TipoCatalogoMonitoreo.TECNICA,
      true,
    );
    const entrada = entradas.find(
      (e) =>
        tecnica !== undefined &&
        e.valor_normalizado === normalizarValor(tecnica),
    );
    if (!entrada?.codigo || entrada.codigo === 'N/A') {
      throw new BadRequestException(
        `La técnica «${tecnica ?? ''}» no tiene código para numerar el reporte; agréguelo en la lista de técnicas`,
      );
    }
    return entrada.codigo;
  }

  /**
   * `undefined` es «no se envió, no tocar»; `''` vacía el campo.
   *
   * Los valores de lista llevados a como están en el catálogo, y los archivos
   * comprobados. Con `anterior`, un valor que ya tenía se acepta aunque se
   * haya dado de baja de la lista.
   */
  private async contenidoValidado(
    dto: ActualizarReporteMonitoreoDto,
    anterior?: ReporteMonitoreo,
  ): Promise<Contenido> {
    const activos = await this.catalogos.listar();
    const v = new ValoresDeCatalogo(activos);
    const T = TipoCatalogoMonitoreo;

    const contenido: Contenido = { ...dto };
    delete (contenido as { fecha?: string }).fecha;
    delete (contenido as { tag?: string }).tag;

    if (dto.tecnica !== undefined)
      contenido.tecnica = v.valor(T.TECNICA, dto.tecnica, [anterior?.tecnica]);
    if (dto.tecnica_apoyo !== undefined) {
      contenido.tecnica_apoyo = v.valor(T.TECNICA, dto.tecnica_apoyo, [
        anterior?.tecnica_apoyo,
      ]);
    }
    if (dto.resultado !== undefined) {
      contenido.resultado = v.valor(T.SEVERIDAD, dto.resultado, [
        anterior?.resultado,
      ]);
    }
    if (dto.lecturas) {
      contenido.lecturas = {
        ...dto.lecturas,
        punto_referencia: v.valor(
          T.PUNTO_REFERENCIA,
          dto.lecturas.punto_referencia,
          [anterior?.lecturas?.punto_referencia],
        ),
        instrumento: v.valor(T.INSTRUMENTO, dto.lecturas.instrumento, [
          anterior?.lecturas?.instrumento,
        ]),
      };
    }
    if (dto.tareas) {
      const previas = anterior?.tareas ?? [];
      contenido.tareas = dto.tareas.map((t) => ({
        ...t,
        grupo_trabajo: v.valor(
          T.GRUPO_TRABAJO,
          t.grupo_trabajo,
          previas.map((p) => p.grupo_trabajo),
        ),
        prioridad: v.valor(
          T.PRIORIDAD_JDE,
          t.prioridad,
          previas.map((p) => p.prioridad),
        ),
      }));
    }
    if (dto.recomendaciones) {
      contenido.recomendaciones = dto.recomendaciones
        .map((r) => r.trim())
        .filter(Boolean);
    }

    const archivos = [
      ...(dto.fotos ?? []),
      ...(dto.grafico ? [dto.grafico] : []),
    ].map((i) => i.archivo);
    const faltan = await this.archivos.faltantes(archivos);
    const errores = [
      ...v.errores,
      ...faltan.map((a) => `La imagen ${a} no está entre los archivos subidos`),
    ];
    if (errores.length > 0) {
      throw new BadRequestException({ message: errores });
    }
    return contenido;
  }
}
