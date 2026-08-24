import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Pgr,
  PgrDocument,
  PgrEstado,
  ActividadEstado,
} from './schemas/pgr.schema';
import { CreateActividadDto, CreatePgrDto } from './dto/create-pgr.dto';
import { UpdatePgrDto } from './dto/update-pgr.dto';
import { AprobarPgrDto } from './dto/aprobar-pgr.dto';
import { SeguimientoPgrDto } from './dto/seguimiento-pgr.dto';
import { SeguimientoBatchItemDto } from './dto/seguimiento-batch.dto';
import { Area } from '../area/schemas/area.schema';
import { Superintendencia } from '../superintendencia/schemas/superintendencia.schema';
import {
  calcularIndicadoresActividad,
  calcularIndicadoresPgr,
  IndicadoresPgr,
} from './domain/pgr-kpi.util';

const MAX_INTENTOS_CODIGO = 5;

/** PGR con sus indicadores calculados al vuelo (no se persisten). */
export type PgrConIndicadores = Pgr & {
  indicadores: IndicadoresPgr;
  actividades: Array<
    Pgr['actividades'][number] & { indicadores: IndicadoresPgr }
  >;
};

@Injectable()
export class PgrService {
  constructor(
    @InjectModel(Pgr.name) private pgrModel: Model<PgrDocument>,
    @InjectModel(Area.name) private areaModel: Model<Area>,
    @InjectModel(Superintendencia.name)
    private superintendenciaModel: Model<Superintendencia>,
  ) {}

  private async generateNextCode(gestion: string): Promise<string> {
    const lastPgr = await this.pgrModel
      .findOne({ codigoAutogenerado: new RegExp(`^PLAN-${gestion}-`) })
      .sort({ codigoAutogenerado: -1 })
      .exec();

    let nextNumber = 1;
    if (lastPgr) {
      const parts = lastPgr.codigoAutogenerado.split('-');
      if (parts.length === 3) {
        nextNumber = parseInt(parts[2], 10) + 1;
      }
    }

    return `PLAN-${gestion}-${nextNumber.toString().padStart(4, '0')}`;
  }

  async create(createPgrDto: CreatePgrDto): Promise<Pgr> {
    const gestion = createPgrDto.gestion || new Date().getFullYear().toString();
    const areasResueltas = await this.resolverAreas(
      createPgrDto.areas || [],
      createPgrDto.superintendencia,
    );

    // Reintenta ante colisión del índice único `codigoAutogenerado`: dos
    // creaciones concurrentes pueden leer el mismo "último código" antes de
    // que cualquiera de las dos haga save(); el retry con el siguiente
    // número resuelve la condición de carrera sin necesitar una colección
    // de contadores separada.
    for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento++) {
      const codigoAutogenerado = await this.generateNextCode(gestion);
      try {
        const nuevoPgr = new this.pgrModel({
          ...createPgrDto,
          areas: areasResueltas,
          codigoAutogenerado,
          estado: createPgrDto.estado || PgrEstado.BORRADOR,
        });
        return await nuevoPgr.save();
      } catch (error) {
        const esColisionDeCodigo = (error as { code?: number })?.code === 11000;
        if (esColisionDeCodigo && intento < MAX_INTENTOS_CODIGO - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      'No se pudo generar un código único para el PGR tras varios intentos',
    );
  }

  /**
   * Adjunta los indicadores calculados a un PGR y a cada una de sus
   * actividades. Se calculan al vuelo a partir de `programacion[]`: no se
   * persisten, así cambiar `mesCorte` no obliga a recalcular nada en base
   * de datos y no hay riesgo de que queden desincronizados.
   */
  enriquecerConIndicadores(pgr: Pgr): PgrConIndicadores {
    const plano: Pgr =
      typeof (pgr as unknown as { toObject?: () => Pgr }).toObject ===
      'function'
        ? (pgr as unknown as { toObject: () => Pgr }).toObject()
        : pgr;

    const mesCorte = plano.mesCorte ?? 12;
    const ventana = plano.ventanaGestion ?? 12;
    const actividades = plano.actividades ?? [];

    return {
      ...plano,
      indicadores: calcularIndicadoresPgr(actividades, mesCorte, ventana),
      actividades: actividades.map((a) => ({
        ...a,
        indicadores: calcularIndicadoresActividad(
          a.programacion ?? [],
          mesCorte,
          ventana,
        ),
      })),
    } as PgrConIndicadores;
  }

  async findAll(): Promise<Pgr[]> {
    return this.pgrModel.find().exec();
  }

  async findOne(id: string): Promise<Pgr> {
    const pgr = await this.pgrModel.findById(id).exec();
    if (!pgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return pgr;
  }

  /** `findOne` con los indicadores de eficacia y eficiencia ya calculados. */
  async findOneConIndicadores(id: string): Promise<PgrConIndicadores> {
    return this.enriquecerConIndicadores(await this.findOne(id));
  }

  /**
   * Busca por el código del documento origen (`V04-G02-...`).
   * Se usa como clave natural para detectar reimportaciones del mismo Excel.
   */
  async findByCodigoExterno(
    codigoExterno: string,
  ): Promise<PgrDocument | null> {
    return this.pgrModel.findOne({ codigoExterno }).exec();
  }

  /**
   * Fusiona las actividades que manda el formulario con las ya guardadas.
   *
   * El formulario de configuración solo conoce los campos que edita
   * —descripción, responsable, verificador, recurso, entregable y la
   * programación mensual—. El resto de la actividad lo escriben otros flujos:
   * `origenMatriz` lo pone la consolidación desde las matrices de riesgo,
   * `estadoAprobacion`/`motivoRechazo` la aprobación, y el seguimiento sus
   * propios endpoints.
   *
   * Antes el update reemplazaba el array entero, así que guardar desde
   * configuración borraba todo eso y además **regeneraba los `_id`**, dejando
   * huérfanos a los flujos que apuntan a una actividad por id. En un PGR
   * consolidado eso significaba perder la trazabilidad de sus actividades y
   * que la siguiente consolidación las volviera a proponer como nuevas,
   * duplicándolas.
   *
   * Casar por `_id` conserva lo que el formulario no toca. Las entrantes sin
   * `_id` son altas; las guardadas que ya no vienen son bajas.
   */
  private fusionarActividades(
    existentes: PgrDocument['actividades'],
    entrantes: CreateActividadDto[],
  ): CreateActividadDto[] {
    const porId = new Map(
      (existentes ?? []).map((actividad) => {
        const plana =
          (
            actividad as unknown as { toObject?: () => Record<string, unknown> }
          ).toObject?.() ?? (actividad as unknown as Record<string, unknown>);
        return [String(plana._id ?? ''), plana];
      }),
    );

    return entrantes.map((entrante) => {
      const previa = entrante._id ? porId.get(entrante._id) : undefined;
      if (!previa) {
        // Alta: que Mongoose le asigne `_id` y los valores por defecto del
        // esquema (`estadoAprobacion: PENDIENTE`, `programacion: []`).
        const { _id: _descartado, ...nueva } = entrante;
        void _descartado;
        return nueva as CreateActividadDto;
      }

      // Solo se pisan los campos que el formulario declara. `undefined` es
      // "no lo mandó", no "borralo": la programación no viaja en todos los
      // payloads y sobreescribirla con vacío perdería los KPIs.
      const fusionada: Record<string, unknown> = { ...previa };
      for (const [campo, valor] of Object.entries(entrante)) {
        if (campo !== '_id' && valor !== undefined) fusionada[campo] = valor;
      }
      return fusionada as unknown as CreateActividadDto;
    });
  }

  async update(id: string, updatePgrDto: UpdatePgrDto): Promise<Pgr> {
    const payload: Partial<typeof updatePgrDto> = { ...updatePgrDto };
    const tocaActividades = Array.isArray(updatePgrDto.actividades);

    if (
      'areas' in updatePgrDto ||
      'superintendencia' in updatePgrDto ||
      tocaActividades
    ) {
      const existing = await this.findOne(id);

      if ('areas' in updatePgrDto || 'superintendencia' in updatePgrDto) {
        const superintendencia =
          (updatePgrDto as UpdatePgrDto & { superintendencia?: string })
            .superintendencia ?? existing.superintendencia;
        const areasIn =
          (updatePgrDto as UpdatePgrDto & { areas?: string[] }).areas ??
          existing.areas ??
          [];
        payload['areas'] = await this.resolverAreas(areasIn, superintendencia);
      }

      if (tocaActividades) {
        payload.actividades = this.fusionarActividades(
          existing.actividades,
          updatePgrDto.actividades ?? [],
        );
      }
    }

    const pgr = await this.pgrModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!pgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return pgr;
  }

  /** Si el array de áreas viene vacío, busca todas las áreas activas de la superintendencia */
  private async resolverAreas(
    areas: string[],
    superintendenciaNombre: string,
  ): Promise<string[]> {
    if (areas && areas.length > 0) {
      return areas;
    }

    const nombreEscapado = superintendenciaNombre.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

    const sup = await this.superintendenciaModel
      .findOne({ nombre: { $regex: new RegExp(`^${nombreEscapado}$`, 'i') } })
      .exec();

    if (!sup) {
      throw new BadRequestException(
        `Superintendencia "${superintendenciaNombre}" no encontrada. No se puede resolver el listado de áreas.`,
      );
    }

    const areasEncontradas = await this.areaModel
      .find({ superintendencia: sup._id, activo: true })
      .exec();

    return areasEncontradas.map((a) => a.nombre);
  }

  /**
   * Aprueba/rechaza actividades individuales y recalcula el estado general.
   * Usa `bulkWrite` + `arrayFilters` para tocar solo los elementos del array
   * que corresponden a cada actividad, en vez de leer el documento completo
   * y reescribir todo `actividades` (evita el problema de "lost update" ante
   * escrituras concurrentes sobre el mismo plan).
   */
  private async assertActividadesCompletas(id: string): Promise<void> {
    const plan = await this.pgrModel
      .findById(id)
      .select(
        'actividades.descripcion actividades.responsables ' +
          'actividades.recursos actividades.entregables',
      )
      .lean()
      .exec();
    if (!plan) return;

    // Basta con que cada lista tenga al menos un elemento: el detalle de cada
    // uno lo valida su propio DTO al escribirlos.
    const incompletas = (plan.actividades ?? []).filter(
      (a) =>
        (a.responsables ?? []).length === 0 ||
        (a.recursos ?? []).length === 0 ||
        (a.entregables ?? []).length === 0,
    );

    if (incompletas.length) {
      throw new BadRequestException(
        `${incompletas.length} actividad(es) sin responsable, recurso o entregable: ` +
          incompletas
            .slice(0, 3)
            .map((a) => `"${a.descripcion?.slice(0, 40)}"`)
            .join(', ') +
          (incompletas.length > 3 ? '…' : '') +
          '. Completalas antes de aprobar el PGR.',
      );
    }
  }

  async aprobar(id: string, aprobarPgrDto: AprobarPgrDto): Promise<Pgr> {
    const isRechazado = aprobarPgrDto.actividadesAprobacion.some(
      (a) => a.estadoAprobacion === ActividadEstado.RECHAZADO,
    );
    const estado = isRechazado ? PgrEstado.CORREGIR : PgrEstado.APROBADO;

    // `responsable`, `recurso` y `entregable` son opcionales en el schema
    // porque una actividad consolidada desde la matriz nace sin ellos. Que
    // falten al aprobar sí es un problema: sin responsable ni entregable la
    // actividad no se puede ejecutar ni medir.
    if (!isRechazado) {
      await this.assertActividadesCompletas(id);
    }

    if (aprobarPgrDto.actividadesAprobacion.length > 0) {
      await this.pgrModel.bulkWrite(
        aprobarPgrDto.actividadesAprobacion.map((item) => ({
          updateOne: {
            filter: { _id: id },
            update: {
              $set: {
                'actividades.$[elem].estadoAprobacion': item.estadoAprobacion,
                'actividades.$[elem].motivoRechazo': item.motivoRechazo,
              },
            },
            arrayFilters: [{ 'elem._id': item._id }],
          },
        })),
      );
    }

    const updatedPgr = await this.pgrModel
      .findByIdAndUpdate(
        id,
        {
          estado,
          aprobadoPor: aprobarPgrDto.aprobadoPor,
          fechaAprobacion: new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedPgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }

    return updatedPgr;
  }

  /** Construye el `$set` de una actividad para bulkWrite a partir de un DTO de seguimiento. */
  private buildSeguimientoSet(
    seguimientoDto: SeguimientoPgrDto,
  ): Record<string, unknown> {
    const set: Record<string, unknown> = {};
    if (seguimientoDto.fechaEjecucion !== undefined) {
      set['actividades.$[elem].fechaEjecucion'] = new Date(
        seguimientoDto.fechaEjecucion,
      );
    }
    if (seguimientoDto.observaciones !== undefined) {
      set['actividades.$[elem].observaciones'] = seguimientoDto.observaciones;
    }
    if (seguimientoDto.semaforoTiempo !== undefined) {
      set['actividades.$[elem].semaforoTiempo'] = seguimientoDto.semaforoTiempo;
    }
    if (seguimientoDto.evidencias !== undefined) {
      set['actividades.$[elem].evidencias'] = seguimientoDto.evidencias;
    }
    if (seguimientoDto.programacion !== undefined) {
      // Las cantidades ejecutadas por categoría son la base del cálculo de
      // eficacia y eficiencia; se reemplaza el array completo de la actividad.
      set['actividades.$[elem].programacion'] = seguimientoDto.programacion;
    }
    return set;
  }

  async addSeguimiento(
    pgrId: string,
    actividadId: string,
    seguimientoDto: SeguimientoPgrDto,
  ): Promise<Pgr> {
    const set = this.buildSeguimientoSet(seguimientoDto);

    const updatedPgr = await this.pgrModel
      .findOneAndUpdate(
        { _id: pgrId, 'actividades._id': actividadId },
        { $set: set },
        { new: true, arrayFilters: [{ 'elem._id': actividadId }] },
      )
      .exec();

    if (!updatedPgr) {
      throw new NotFoundException(
        `PGR "${pgrId}" o actividad "${actividadId}" no encontrados`,
      );
    }

    return updatedPgr;
  }

  /**
   * Igual que `addSeguimiento` pero para varias actividades en un solo
   * viaje a Mongo (`bulkWrite`) — reemplaza el loop secuencial de N
   * llamadas HTTP que hacía el frontend por una sola operación batch.
   */
  async addSeguimientoBatch(
    pgrId: string,
    seguimientos: SeguimientoBatchItemDto[],
  ): Promise<Pgr> {
    if (seguimientos.length > 0) {
      await this.pgrModel.bulkWrite(
        seguimientos.map((item) => ({
          updateOne: {
            filter: { _id: pgrId },
            update: { $set: this.buildSeguimientoSet(item) },
            arrayFilters: [{ 'elem._id': item.actividadId }],
          },
        })),
      );
    }

    return this.findOne(pgrId);
  }

  async remove(id: string): Promise<Pgr> {
    const deleted = await this.pgrModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return deleted;
  }
}
