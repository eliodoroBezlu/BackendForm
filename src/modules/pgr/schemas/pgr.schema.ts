import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PgrEstado {
  BORRADOR = 'BORRADOR',
  EN_REVISION = 'EN_REVISION',
  APROBADO = 'APROBADO',
  CORREGIR = 'CORREGIR',
}

export enum ActividadEstado {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

export type PgrDocument = Pgr & Document;

@Schema()
export class Actividad {
  @Prop({ required: true })
  descripcion: string;

  @Prop({ required: true })
  responsable: string;

  @Prop({ required: true })
  verificador: string;

  @Prop({ required: true })
  recurso: string;

  @Prop({ required: true })
  entregable: string;

  @Prop({ required: true })
  frecuencia: string;

  @Prop({ required: true, type: [String] })
  mesesProgramados: string[];

  // Campos para Aprobación
  @Prop({ type: String, enum: ActividadEstado, default: ActividadEstado.PENDIENTE })
  estadoAprobacion: ActividadEstado;

  @Prop({ required: false })
  motivoRechazo?: string;

  // Seguimiento
  @Prop({ required: false })
  fechaEjecucion?: Date;

  @Prop({ required: false })
  observaciones?: string;

  @Prop({ required: false, type: [String] })
  evidencias?: string[];

  @Prop({ required: false })
  semaforoTiempo?: string; // e.g. "En el Mes", "Atrasado"
}

@Schema({ timestamps: true })
export class Pgr {
  @Prop({ required: true, unique: true })
  codigoAutogenerado: string;

  // Configuración Inicial
  @Prop({ required: true })
  empresa: string;

  @Prop({ required: true })
  vicepresidencia: string;

  @Prop({ required: true })
  gerencia: string;

  @Prop({ required: true })
  superintendencia: string;

  @Prop({ required: true })
  gestion: string;

  @Prop({ required: true, type: String, enum: PgrEstado, default: PgrEstado.BORRADOR })
  estado: PgrEstado;

  @Prop({ type: [String], default: [] })
  areas?: string[];

  // Aprobación Global
  @Prop({ required: false })
  aprobadoPor?: string;

  @Prop({ required: false })
  fechaAprobacion?: Date;

  @Prop({ type: [Actividad], default: [] })
  actividades: Actividad[];

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export const PgrSchema = SchemaFactory.createForClass(Pgr);
