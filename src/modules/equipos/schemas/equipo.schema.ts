import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema({ timestamps: true, collection: 'equipos' })
export class Equipo extends Document {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  codigo: string; // "Cód. Nuevo Asig" / "Código Interno"

  @Prop({ type: String })
  codigo_antiguo?: string;

  @Prop({ type: String })
  codigo_parte?: string;

  @Prop({ type: String, required: true })
  descripcion: string;

  @Prop({ type: String })
  marca?: string;

  @Prop({ type: String })
  modelo?: string;

  @Prop({ type: Number, default: 1 })
  cantidad: number;

  @Prop({ type: Number })
  costo?: number;

  @Prop({ type: String })
  num_serie?: string;

  @Prop({ type: String })
  frecuencia_uso?: string;

  @Prop({ type: String })
  estado?: string;

  @Prop({ type: String })
  observaciones?: string;

  @Prop({ type: String, required: true, index: true })
  tipo_equipo: string; // "Escalera", "Amoladora", etc.

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true, index: true })
  area_id: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Ubicacion', required: true, index: true })
  ubicacion_id: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Clasificacion', required: true, index: true })
  clasificacion_id: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  especificaciones: Record<string, any>; // Atributos dinámicos
}

export type EquipoDocument = Equipo & Document;
export const EquipoSchema = SchemaFactory.createForClass(Equipo);

// Wildcard index on dynamic specifications field
EquipoSchema.index({ 'especificaciones.$**': 1 });
