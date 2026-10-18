import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { PIEZAS_BOMBA, PiezaBomba } from '../domain/bomba';

/** De dónde salió la intervención. */
export enum OrigenIntervencion {
  /** La planilla de carga inicial. */
  PLANILLA = 'planilla',
  /** Registrada a mano desde la ficha de la bomba. */
  MANUAL = 'manual',
}

/**
 * Un mantenimiento o cambio de piezas de un equipo.
 *
 * Es lo que hoy cada analista escribe a su manera en los antecedentes
 * («Fecha Mtto. … / 20-Ago-24», «Instalación Bba.: 28-Jun-26»). Guardado
 * aparte, el reporte calcula el informe anterior, las horas desde la última
 * intervención y la fecha tentativa de la siguiente.
 */
@Schema({ timestamps: true, collection: 'intervenciones_equipo' })
export class IntervencionEquipo extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
    index: true,
  })
  equipo_id: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  tag: string;

  @Prop({ type: Date, required: true })
  fecha: Date;

  @Prop({ type: String })
  tipo?: string;

  /** Número de la orden de trabajo en JDE. */
  @Prop({ type: String })
  ot?: string;

  /** Horas de operación de la bomba al intervenir. */
  @Prop({ type: Number })
  horas?: number;

  @Prop({ type: [String], enum: PIEZAS_BOMBA, default: [] })
  piezas: PiezaBomba[];

  @Prop({ type: String })
  nota?: string;

  @Prop({ type: String, enum: OrigenIntervencion, required: true })
  origen: OrigenIntervencion;

  @Prop({ type: String })
  registradoPor?: string;

  activo?: boolean;
}

export const IntervencionEquipoSchema =
  SchemaFactory.createForClass(IntervencionEquipo);
IntervencionEquipoSchema.plugin(bajaLogica);

/**
 * Una intervención por equipo y día: es lo que hace idempotente volver a
 * subir la planilla.
 */
IntervencionEquipoSchema.index(
  { equipo_id: 1, fecha: 1 },
  { unique: true, partialFilterExpression: { activo: true } },
);
