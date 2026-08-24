import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Unidad en la que se mide el recurso de una actividad.
 *
 * Hoy la única en uso es `HH` (horas hombre). Vive en la base y no en una
 * constante del código para que agregar `$` —la otra que rotula la columna
 * «Recursos (HH $)» del formulario— no requiera un despliegue.
 */
@Schema({ timestamps: true, collection: 'pgr_unidades_recurso' })
export class UnidadRecurso extends Document {
  /** Código corto, el que se guarda en la actividad. Ej. `HH`. */
  @Prop({ required: true, unique: true, trim: true })
  codigo: string;

  /** Cómo se lee. Ej. `Horas hombre`. */
  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ default: true })
  activo: boolean;
}

export const UnidadRecursoSchema = SchemaFactory.createForClass(UnidadRecurso);

/**
 * Entregable sugerido. El campo de la actividad admite texto libre; esto solo
 * alimenta el autocompletado para que los nombres no se dispersen.
 */
@Schema({ timestamps: true, collection: 'pgr_entregables' })
export class EntregableSugerido extends Document {
  @Prop({ required: true, unique: true, trim: true })
  nombre: string;

  @Prop({ default: true })
  activo: boolean;
}

export const EntregableSugeridoSchema =
  SchemaFactory.createForClass(EntregableSugerido);

/** Cómo se decide quién pertenece a un grupo. */
export enum CriterioGrupo {
  /** Por rol/puesto dentro de un ámbito; se resuelve contra el roster. */
  REGLA = 'regla',
  /** Lista de CIs elegida a mano. */
  LISTA = 'lista',
}

/**
 * Grupo de responsables — «Supervisores de Mantenimiento Chancado».
 *
 * Asignar el grupo a una actividad alcanza a **todos sus miembros**, que se
 * resuelven contra la colección de trabajadores. Cuando no existe un grupo que
 * cubra el caso, la actividad admite un trabajador suelto: las dos formas
 * conviven en `Actividad.responsables`.
 *
 * El criterio por regla se mantiene solo con el sync del roster; el manual hay
 * que actualizarlo a mano, y existe para los grupos que no responden a ninguna
 * regla.
 */
@Schema({ timestamps: true, collection: 'pgr_grupos_responsables' })
export class GrupoResponsable extends Document {
  @Prop({ required: true, trim: true })
  nombre: string;

  /** Ámbito. Vacío = sin restricción. */
  @Prop({ required: false, trim: true })
  superintendencia?: string;

  @Prop({ type: [String], default: [] })
  areas: string[];

  @Prop({ required: true, type: String, enum: CriterioGrupo })
  criterio: CriterioGrupo;

  /** Con `criterio: regla` — roles del IAM que debe tener el trabajador. */
  @Prop({ type: [String], default: [] })
  roles: string[];

  /** Con `criterio: regla` — texto que debe contener el puesto. */
  @Prop({ required: false, trim: true })
  puestoContiene?: string;

  /** Con `criterio: lista` — CIs de los miembros. */
  @Prop({ type: [String], default: [] })
  miembros: string[];

  @Prop({ default: true })
  activo: boolean;
}

export const GrupoResponsableSchema =
  SchemaFactory.createForClass(GrupoResponsable);
