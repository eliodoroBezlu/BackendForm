import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { PIEZAS_BOMBA, PiezaBomba } from '../domain/bomba';

/**
 * Una pieza de desgaste montada en un equipo: la voluta de la 230PP013 que se
 * instaló el 28-jun-26.
 *
 * Cada cambio de pieza **crea un documento nuevo** y retira el anterior
 * (`vigente: false`, `retirado_en`), en vez de pisarlo. Así la historia de la
 * pieza se conserva y las horas de cada una salen de su propia fecha de
 * instalación, no de la de la bomba.
 */
@Schema({ timestamps: true, collection: 'componentes_equipo' })
export class ComponenteEquipo extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
    index: true,
  })
  equipo_id: Types.ObjectId;

  /** El TAG del equipo, repetido para que el documento se entienda solo. */
  @Prop({ type: String, required: true, index: true })
  tag: string;

  @Prop({ type: String, enum: PIEZAS_BOMBA, required: true })
  pieza: PiezaBomba;

  @Prop({ type: String })
  proveedor?: string;

  @Prop({ type: String })
  material?: string;

  @Prop({ type: Number })
  dureza_hb?: number;

  @Prop({ type: String })
  condicion_inicial?: string;

  @Prop({ type: Number })
  espesor_nominal_mm?: number;

  @Prop({ type: Number })
  espesor_precaucion_mm?: number;

  @Prop({ type: Date })
  fecha_instalacion?: Date;

  /** La pieza montada hoy. Solo una por equipo y pieza. */
  @Prop({ type: Boolean, default: true })
  vigente: boolean;

  @Prop({ type: Date })
  retirado_en?: Date;

  @Prop({ type: String })
  registradoPor?: string;

  activo?: boolean;
}

export const ComponenteEquipoSchema =
  SchemaFactory.createForClass(ComponenteEquipo);
ComponenteEquipoSchema.plugin(bajaLogica);

/**
 * Una sola pieza vigente por equipo. El índice es parcial sobre `activo: true`
 * para que una dada de baja no impida montar la siguiente.
 */
ComponenteEquipoSchema.index(
  { equipo_id: 1, pieza: 1 },
  { unique: true, partialFilterExpression: { vigente: true, activo: true } },
);
