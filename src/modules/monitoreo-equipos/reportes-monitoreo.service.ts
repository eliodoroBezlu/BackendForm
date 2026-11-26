import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { marcarDadoDeBaja } from '../../common/baja-logica/baja-logica.plugin';
import { AntecedentesMonitoreoService } from './antecedentes-monitoreo.service';
import { BombasService } from './bombas.service';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { CorrelativosMonitoreoService } from './correlativos-monitoreo.service';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { PlantillasMonitoreoService } from './plantillas-monitoreo.service';
import { PlantillasMedicionService } from './plantillas-medicion.service';
import { TIPO_EQUIPO_BOMBA } from './domain/bomba';
import {
  erroresDeValores,
  ValoresDeMedicion,
  valoresVacios,
} from './domain/espesores';
import {
  normalizarValor,
  TipoCatalogoMonitoreo,
} from './domain/catalogos-iniciales';
import {
  codigoInterno,
  EstadoReporte,
  faltantesParaEnviar,
  MedicionDelReporte,
  PiezaDelReporte,
} from './domain/reporte';
import { ValoresDeCatalogo } from './domain/valores-de-catalogo';
import {
  ActualizarReporteMonitoreoDto,
  CrearReporteMonitoreoDto,
  FiltrosReportesDto,
} from './dto/reporte-monitoreo.dto';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';
import { PlantillaMedicion } from './schemas/plantilla-medicion.schema';

type Contenido = Omit<
  ActualizarReporteMonitoreoDto,
  'fecha' | 'piezas' | 'medicion_valores'
> & {
  piezas?: PiezaDelReporte[];
};

/** Lo que no es una bomba ni está en el inventario. */
const SIN_INVENTARIO = 'Sin inventario';

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
    private readonly plantillasMedicion: PlantillasMedicionService,
    private readonly bombas: BombasService,
  ) {}

  private readonly logger = new Logger(ReportesMonitoreoService.name);

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
    const plantillaMedicion = await this.plantillasMedicion.aplicable(
      dto.tag,
      contenido.tecnica,
    );
    const medicion = plantillaMedicion
      ? this.medicionDesde(plantillaMedicion, dto.medicion_valores)
      : this.sinMedicion(dto.medicion_valores);
    // Con plantilla de medición el tag no tiene que ser una bomba.
    const prellenado = await this.antecedentes.armar(
      dto.tag,
      fecha,
      contenido.lecturas?.horas,
      undefined,
      contenido.piezas,
      { sinFicha: !!medicion, tecnica: contenido.tecnica },
    );
    const tipoEquipo = prellenado.tipo_equipo ?? SIN_INVENTARIO;
    const plantilla = await this.plantillas.obtener(TIPO_EQUIPO_BOMBA);

    return this.modelo.create(
      sinIndefinidos({
        ...contenido,
        // Las piezas son de la ficha de una bomba: otro equipo no las tiene.
        piezas: tipoEquipo === TIPO_EQUIPO_BOMBA ? contenido.piezas : undefined,
        medicion,
        tipo_equipo: tipoEquipo,
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
    if (reporte.tipo_equipo !== TIPO_EQUIPO_BOMBA) delete contenido.piezas;
    reporte.set(sinIndefinidos(contenido));
    if (dto.fecha) reporte.fecha = new Date(dto.fecha);
    await this.actualizarMedicion(reporte, dto.medicion_valores);
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
      emisividad: reporte.lecturas?.emisividad,
      analisis: reporte.analisis,
      recomendaciones: reporte.recomendaciones ?? [],
      tareas: reporte.tareas ?? [],
      medicion: reporte.medicion,
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

    const emitido = await this.transicion(
      reporte,
      EstadoReporte.PENDIENTE_REVISION,
      {
        $set: {
          estado: EstadoReporte.EMITIDO,
          codigo_interno: codigoInterno(codigoTecnica, correlativo),
          correlativo,
          revisadoPor: usuario,
          emitidoEn: ahora,
        },
        $push: { historial: { accion: 'emitido', por: usuario, en: ahora } },
      },
    );

    // Las piezas que completó el analista pasan a la ficha de la bomba. El
    // reporte ya está emitido: si esto falla, se avisa y no se deshace nada.
    try {
      await this.bombas.guardarPiezasDelReporte(emitido);
    } catch (error) {
      this.logger.warn(
        `No se pudieron guardar en la ficha las piezas de ${emitido.codigo_interno}: ${(error as Error).message}`,
      );
    }
    return emitido;
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
      reporte.piezas,
      { sinFicha: !!reporte.medicion, tecnica: reporte.tecnica },
    );
    reporte.set('antecedentes', sinIndefinidos(antecedentes));
  }

  // ── Medición de espesores ──────────────────────────────────────────────

  /** La grilla y los diagramas de la plantilla, copiados, con sus valores. */
  private medicionDesde(
    plantilla: PlantillaMedicion,
    valores?: unknown[],
  ): MedicionDelReporte {
    const estructura = { titulo: plantilla.titulo, piezas: plantilla.piezas };
    return {
      plantilla_id: String(plantilla._id),
      estructura,
      diagramas: plantilla.diagramas ?? [],
      valores:
        valores === undefined
          ? valoresVacios(estructura)
          : this.valoresValidados(estructura, valores),
    };
  }

  /** Mediciones para un reporte sin grilla: es un error, no se descartan. */
  private sinMedicion(valores?: unknown[]): undefined {
    if (valores !== undefined) {
      throw new BadRequestException(
        'Este reporte no tiene plantilla de medición para su tag y técnica',
      );
    }
    return undefined;
  }

  private valoresValidados(
    estructura: MedicionDelReporte['estructura'],
    valores: unknown[],
  ): ValoresDeMedicion {
    const errores = erroresDeValores(estructura, valores);
    if (errores.length > 0) throw new BadRequestException({ message: errores });
    return valores as ValoresDeMedicion;
  }

  /**
   * Un borrador que no tenía grilla la toma si ahora su tag y técnica tienen
   * plantilla (se cambió la técnica, o la plantilla se creó después). Uno
   * que ya la tenía la conserva: cambiar la técnica no borra lo medido.
   */
  private async actualizarMedicion(
    reporte: ReporteMonitoreo,
    valores?: unknown[],
  ): Promise<void> {
    if (reporte.medicion) {
      if (valores === undefined) return;
      reporte.set('medicion', {
        ...reporte.medicion,
        valores: this.valoresValidados(reporte.medicion.estructura, valores),
      });
      return;
    }
    const plantilla = await this.plantillasMedicion.aplicable(
      reporte.tag,
      reporte.tecnica,
    );
    if (plantilla) {
      reporte.set('medicion', this.medicionDesde(plantilla, valores));
    } else {
      this.sinMedicion(valores);
    }
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

    const contenido = { ...dto } as Contenido;
    delete (contenido as { fecha?: string }).fecha;
    delete (contenido as { tag?: string }).tag;
    delete (contenido as { medicion_valores?: unknown }).medicion_valores;

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
    if (dto.piezas) {
      const previas = anterior?.piezas ?? [];
      contenido.piezas = dto.piezas.map((p) =>
        sinIndefinidos({
          pieza: p.pieza,
          fecha_instalacion: p.fecha_instalacion
            ? new Date(p.fecha_instalacion)
            : undefined,
          proveedor: v.valor(
            T.PROVEEDOR,
            p.proveedor,
            previas.map((x) => x.proveedor),
          ),
          condicion_inicial: v.valor(
            T.CONDICION_INICIAL,
            p.condicion_inicial,
            previas.map((x) => x.condicion_inicial),
          ),
          material: p.material?.trim() || undefined,
          horas_trabajo: p.horas_trabajo,
        }),
      );
    }
    if (dto.informe_anterior_url !== undefined) {
      contenido.informe_anterior_url = dto.informe_anterior_url.trim();
    }
    if (dto.antecedentes_texto !== undefined) {
      contenido.antecedentes_texto = dto.antecedentes_texto.trim();
    }
    if (dto.recomendaciones) {
      contenido.recomendaciones = dto.recomendaciones
        .map((r) => r.trim())
        .filter(Boolean);
    }

    const archivos = [
      ...(dto.fotos ?? []),
      ...(dto.anexos ?? []),
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
