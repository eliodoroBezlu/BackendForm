import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlanDeAccionDocument = PlanDeAccion & Document;

@Schema({ _id: false })
export class Evidencia {
  @Prop({ required: true })
  nombre: string;

  @Prop({ required: true })
  url: string;
}

export const EvidenciaSchema = SchemaFactory.createForClass(Evidencia);

@Schema({ _id: false })
export class MLMetadata {
  @Prop({ default: false })
  fue_recomendacion_ml: boolean;

  @Prop()
  indice_recomendacion?: number; // 0, 1, 2 (cuál de las 3 recomendaciones)

  @Prop({ type: [String] })
  recomendaciones_originales?: string[]; // Las 3 opciones que ofreció ML

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const MLMetadataSchema = SchemaFactory.createForClass(MLMetadata);

// 🆕 Subdocumento para las tareas/observaciones
@Schema({})
export class TareaObservacion {
  _id?: Types.ObjectId;
  @Prop({ required: true })
  numeroItem: number;

  @Prop({ required: true })
  fechaHallazgo: Date;

  @Prop({ required: true })
  responsableObservacion: string;

  @Prop({ required: true })
  empresa: string;

  @Prop({ required: true })
  lugarFisico: string;

  @Prop({ required: true })
  actividad: string;

  @Prop({ required: true })
  familiaPeligro: string;

  @Prop({ required: true })
  descripcionObservacion: string;

  @Prop({})
  accionPropuesta?: string;

  @Prop({ required: true })
  responsableAreaCierre: string;

  @Prop()
  responsableAreaCierreUsername?: string;

  @Prop()
  fechaCumplimientoAcordada?: Date;

  @Prop()
  fechaCumplimientoEfectiva?: Date;

  @Prop({ default: 0 })
  diasRetraso: number;

  @Prop({
    enum: ['abierto', 'en-progreso', 'cerrado'],
    default: 'abierto',
  })
  estado: string;

  @Prop({ default: false })
  aprobado: boolean;

  @Prop({ type: [EvidenciaSchema], default: [] })
  evidencias?: Evidencia[];

  @Prop({ type: MLMetadataSchema })
  mlMetadata?: MLMetadata;
  // Trazabilidad (opcional, solo si viene de inspección)
  @Prop()
  instanceId?: string;

  @Prop()
  sectionId?: string;

  @Prop()
  sectionTitle?: string;

  @Prop()
  questionText?: string;

  @Prop({ default: true })
  activo: boolean;
}

export const TareaObservacionSchema =
  SchemaFactory.createForClass(TareaObservacion);

// 🆕 Trazabilidad de la aprobación global del Superintendente
@Schema({ _id: false })
export class HistorialAprobacion {
  @Prop({ required: true })
  usuario: string;

  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  estadoAnterior: string;

  @Prop({ required: true })
  estadoNuevo: string;

  @Prop()
  observaciones?: string;
}

export const HistorialAprobacionSchema =
  SchemaFactory.createForClass(HistorialAprobacion);

// 🔥 Plan de Acción como CONTENEDOR
@Schema({ timestamps: true })
export class PlanDeAccion {
  // Datos organizacionales
  @Prop({ required: true })
  vicepresidencia: string;

  @Prop()
  instanceId?: string;

  @Prop()
  superintendenciaSenior?: string;

  @Prop()
  superintendencia?: string;

  @Prop({ required: true })
  areaFisica: string;

  // Array de tareas/observaciones
  @Prop({ type: [TareaObservacionSchema], default: [] })
  tareas: TareaObservacion[];

  // Metadatos calculados automáticamente
  @Prop({ default: 0 })
  totalTareas: number;

  @Prop({ default: 0 })
  tareasAbiertas: number;

  @Prop({ default: 0 })
  tareasEnProgreso: number;

  @Prop({ default: 0 })
  tareasCerradas: number;

  @Prop({ default: 0 })
  porcentajeCierre: number;

  // Estado general del plan
  @Prop({
    enum: ['abierto', 'en-progreso', 'cerrado'],
    default: 'abierto',
  })
  estado: string;

  // Fechas
  @Prop({ required: true })
  fechaCreacion: Date;

  @Prop({ required: true })
  fechaUltimaActualizacion: Date;

  // Baja lógica: los planes nunca se eliminan físicamente
  @Prop({ default: true })
  activo: boolean;

  // 🆕 Aprobación global del Superintendente (independiente del aprobado por tarea)
  @Prop({
    enum: ['pendiente', 'aprobado'],
    default: 'pendiente',
  })
  estadoAprobacion: string;

  @Prop()
  aprobadoPor?: string;

  @Prop()
  fechaAprobacion?: Date;

  @Prop()
  observacionesAprobacion?: string;

  @Prop({ type: [HistorialAprobacionSchema], default: [] })
  historialAprobacion: HistorialAprobacion[];
}

export const PlanDeAccionSchema = SchemaFactory.createForClass(PlanDeAccion);

// Índices
PlanDeAccionSchema.index({ estado: 1 });
PlanDeAccionSchema.index({ vicepresidencia: 1 });
PlanDeAccionSchema.index({ superintendencia: 1 });
PlanDeAccionSchema.index({ areaFisica: 1 });
PlanDeAccionSchema.index({ fechaCreacion: -1 });
PlanDeAccionSchema.index({ 'tareas.estado': 1 });
PlanDeAccionSchema.index({ 'tareas.aprobado': 1 });
PlanDeAccionSchema.index({ activo: 1 });
PlanDeAccionSchema.index({ estadoAprobacion: 1 });
