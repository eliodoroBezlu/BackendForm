import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { InspectionStatus } from '../types/IProps';

// ============================================
// SUB-SCHEMAS
// ============================================

@Schema({  })
export class QuestionResponse {
  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  value: string | number | boolean;

  @Prop()
  observacion?: string;

  @Prop()
  description?: string;
}

@Schema({ })
export class GroupedQuestionData {
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  values: Record<string, string>; // "si", "no", "na"

  @Prop({ required: true })
  observacion: string;
}

@Schema({ strict: false})
export class OutOfServiceData {
  @Prop()
  status?: string;

  @Prop()
  date?: string;

  @Prop()
  observations?: string;

  @Prop()
  tag?: string;

  @Prop()
  inspector?: string;

  @Prop()
  capacidad?: string;

  @Prop()
  tipo?: string;

  @Prop()
  fechaCorrecion?: string;
}

@Schema({ })
export class DamageMarker {
  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop()
  description?: string;
}

@Schema({  })
export class VehicleData {
  @Prop({ type: [DamageMarker] })
  damages?: DamageMarker[];

  @Prop()
  damageImageBase64?: string;

  @Prop()
  damageObservations?: string;

  @Prop()
  tipoInspeccion?: string;

  @Prop()
  certificacionMSC?: string;

  @Prop()
  fechaProximaInspeccion?: string;

  @Prop()
  responsableProximaInspeccion?: string;
}

@Schema({  })
export class RoutineInspectionEntry {
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  inspector: string;

  @Prop({ required: true })
  response: string;

  @Prop()
  observations?: string;

  @Prop()
  signature?: string;
}

@Schema({  })
export class ScaffoldData {
  @Prop({ type: [RoutineInspectionEntry] })
  routineInspections?: RoutineInspectionEntry[];

  @Prop()
  finalConclusion?: string;
}

@Schema({  })
export class AccesorioConfig {
  @Prop({ required: true })
  cantidad: number;

  @Prop({ required: true })
  tipoServicio: string;
}

// ✅ NUEVO: Schema de Aprobación
@Schema({ _id: false })
export class ApprovalData {
  @Prop({ required: true, enum: ['pending', 'approved', 'rejected'] })
  status: 'pending' | 'approved' | 'rejected';

  @Prop()
  approvedBy?: string; // Email o nombre del supervisor

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop()
  supervisorComments?: string;
}

// ============================================
// SCHEMA PRINCIPAL - InspectionHerraEquipos
// ============================================

@Schema({ 
  timestamps: true,
  collection: 'inspections_herra_equipos' 
})
export class InspectionHerraEquipos {

  _id?: mongoose.Types.ObjectId;
  
  @Prop({ required: true, type: Types.ObjectId, ref: 'TemplateHerraEquipos' })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateCode: string;

  @Prop()
  templateName?: string;

  // ============================================
  // DATOS DE VERIFICACIÓN
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  verification: Record<string, string | number>;

  // ============================================
  // RESPUESTAS DE PREGUNTAS
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  responses: Record<string, Record<string, any>>;

  // ============================================
  // OBSERVACIONES GENERALES
  // ============================================
  @Prop()
  generalObservations?: string;

  // ============================================
  // FIRMAS
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed })
  inspectorSignature?: Record<string, string | number>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  supervisorSignature?: Record<string, string | number>;

  // ============================================
  // DATOS OPCIONALES
  // ============================================
  @Prop({ type: OutOfServiceData })
  outOfService?: OutOfServiceData;

  @Prop({ type: MongooseSchema.Types.Mixed })
  accesoriosConfig?: Record<string, AccesorioConfig>;

  @Prop({ type: VehicleData })
  vehicle?: VehicleData;

  @Prop({ type: ScaffoldData })
  scaffold?: ScaffoldData;

  @Prop({ type: [String] })
  selectedSubsections?: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  selectedItems?: Record<string, string[]>;

  // ============================================
  // METADATOS
  // ============================================
  @Prop({ 
    required: true, 
    enum: Object.values(InspectionStatus), 
    default: InspectionStatus.DRAFT 
  })
  status: InspectionStatus;

  @Prop({ required: true })
  submittedAt: Date;

  @Prop()
  submittedBy?: string;

  @Prop()
  location?: string;

  @Prop()
  project?: string;

  // ✅ NUEVOS CAMPOS DE APROBACIÓN
  @Prop({ default: false })
  requiresApproval?: boolean;

  @Prop({ type: ApprovalData })
  approval?: ApprovalData;
}

export type InspectionHerraEquiposDocument = InspectionHerraEquipos & Document;
export const InspectionHerraEquiposSchema = SchemaFactory.createForClass(InspectionHerraEquipos);

// ============================================
// ÍNDICES PARA OPTIMIZAR BÚSQUEDAS
// ============================================
InspectionHerraEquiposSchema.index({ templateCode: 1, status: 1 });
InspectionHerraEquiposSchema.index({ submittedAt: -1 });
InspectionHerraEquiposSchema.index({ 'verification.numeroPlaca': 1 });
InspectionHerraEquiposSchema.index({ submittedBy: 1 });
// ✅ NUEVO: Índice para búsquedas de aprobación
InspectionHerraEquiposSchema.index({ status: 1, requiresApproval: 1 });
InspectionHerraEquiposSchema.index({ 'approval.status': 1 });