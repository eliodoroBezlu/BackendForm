import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CriterioGrupo,
  EntregableSugerido,
  GrupoResponsable,
  UnidadRecurso,
} from './schemas/pgr-catalogo.schema';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';

/** Miembro resuelto de un grupo. */
export interface MiembroGrupo {
  ci: string;
  nombre: string;
  puesto: string;
  area: string;
}

/**
 * Catálogos configurables del PGR: unidades de recurso, entregables sugeridos
 * y grupos de responsables.
 *
 * Existe para que estas listas no vivan en el código. Antes `recurso` y
 * `entregable` eran texto libre y en la base quedaron valores como «dsa» o
 * «qwe»; ahora la unidad se elige de un catálogo y el entregable se sugiere.
 */
@Injectable()
export class PgrCatalogoService implements OnModuleInit {
  private readonly logger = new Logger(PgrCatalogoService.name);

  constructor(
    @InjectModel(UnidadRecurso.name)
    private readonly unidadModel: Model<UnidadRecurso>,
    @InjectModel(EntregableSugerido.name)
    private readonly entregableModel: Model<EntregableSugerido>,
    @InjectModel(GrupoResponsable.name)
    private readonly grupoModel: Model<GrupoResponsable>,
    @InjectModel(Trabajador.name)
    private readonly trabajadorModel: Model<Trabajador>,
  ) {}

  /**
   * Siembra la única unidad que hoy se usa. Es un `upsert`, así que si alguien
   * la renombra o agrega otras, esto no las pisa ni las duplica.
   */
  async onModuleInit() {
    try {
      await this.unidadModel.updateOne(
        { codigo: 'HH' },
        { $setOnInsert: { nombre: 'Horas hombre', activo: true } },
        { upsert: true },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo sembrar la unidad HH: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }

  // ── Unidades de recurso ───────────────────────────────────────────────────

  async listarUnidades(incluirInactivas = false): Promise<UnidadRecurso[]> {
    const filtro = incluirInactivas ? {} : { activo: true };
    return this.unidadModel.find(filtro).sort({ codigo: 1 }).exec();
  }

  async crearUnidad(datos: {
    codigo: string;
    nombre: string;
  }): Promise<UnidadRecurso> {
    return new this.unidadModel({ ...datos, activo: true }).save();
  }

  async actualizarUnidad(
    id: string,
    datos: Partial<{ codigo: string; nombre: string; activo: boolean }>,
  ): Promise<UnidadRecurso> {
    const unidad = await this.unidadModel
      .findByIdAndUpdate(id, datos, { new: true })
      .exec();
    if (!unidad) throw new NotFoundException('Unidad no encontrada');
    return unidad;
  }

  // ── Entregables sugeridos ─────────────────────────────────────────────────

  async listarEntregables(): Promise<EntregableSugerido[]> {
    return this.entregableModel
      .find({ activo: true })
      .sort({ nombre: 1 })
      .exec();
  }

  async crearEntregable(nombre: string): Promise<EntregableSugerido> {
    return new this.entregableModel({ nombre, activo: true }).save();
  }

  async actualizarEntregable(
    id: string,
    datos: Partial<{ nombre: string; activo: boolean }>,
  ): Promise<EntregableSugerido> {
    const doc = await this.entregableModel
      .findByIdAndUpdate(id, datos, { new: true })
      .exec();
    if (!doc) throw new NotFoundException('Entregable no encontrado');
    return doc;
  }

  // ── Grupos de responsables ────────────────────────────────────────────────

  /** Los grupos aplicables a una superintendencia, más los sin ámbito. */
  async listarGrupos(superintendencia?: string): Promise<GrupoResponsable[]> {
    const filtro: Record<string, unknown> = { activo: true };
    if (superintendencia) {
      filtro.$or = [
        { superintendencia: { $exists: false } },
        { superintendencia: null },
        { superintendencia: '' },
        { superintendencia },
      ];
    }
    return this.grupoModel.find(filtro).sort({ nombre: 1 }).exec();
  }

  async crearGrupo(
    datos: Partial<GrupoResponsable>,
  ): Promise<GrupoResponsable> {
    return new this.grupoModel({ ...datos, activo: true }).save();
  }

  async actualizarGrupo(
    id: string,
    datos: Partial<GrupoResponsable>,
  ): Promise<GrupoResponsable> {
    const grupo = await this.grupoModel
      .findByIdAndUpdate(id, datos, { new: true })
      .exec();
    if (!grupo) throw new NotFoundException('Grupo no encontrado');
    return grupo;
  }

  /**
   * Resuelve el grupo a personas concretas.
   *
   * Es lo que hace que asignar un grupo a una actividad «alcance» a sus
   * miembros: sin esto el grupo sería solo una etiqueta.
   */
  async miembrosDelGrupo(id: string): Promise<MiembroGrupo[]> {
    const grupo = await this.grupoModel.findById(id).exec();
    if (!grupo) throw new NotFoundException('Grupo no encontrado');

    const filtro: Record<string, unknown> = {};

    if (grupo.criterio === CriterioGrupo.LISTA) {
      if (grupo.miembros.length === 0) return [];
      filtro.ci = { $in: grupo.miembros };
    } else {
      if (grupo.superintendencia)
        filtro.superintendencia = grupo.superintendencia;
      if (grupo.areas.length > 0) filtro.area = { $in: grupo.areas };
      if (grupo.roles.length > 0) filtro.roles_iam = { $in: grupo.roles };
      if (grupo.puestoContiene) {
        // Se escapa: el texto lo escribe quien configura el grupo y un
        // paréntesis suelto rompería la consulta.
        const escapado = grupo.puestoContiene.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        );
        filtro.puesto = { $regex: new RegExp(escapado, 'i') };
      }
      // Una regla sin ningún criterio devolvería el roster entero: eso nunca
      // es lo que se quiso configurar.
      if (Object.keys(filtro).length === 0) return [];
    }

    const trabajadores = await this.trabajadorModel
      .find(filtro)
      .select('ci nomina puesto area')
      .lean()
      .exec();

    return trabajadores.map((t) => ({
      ci: t.ci,
      nombre: t.nomina,
      puesto: t.puesto,
      area: t.area,
    }));
  }
}
