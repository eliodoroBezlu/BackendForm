// src/equipment-tracking/schemas/equipment-inspection-tracking.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'equipment_inspection_tracking' })
export class EquipmentInspectionTracking extends Document {
  @Prop({ required: true, index: true })
  equipmentId: string; // TAG único (ej: "TECLE-001")

  @Prop({ required: true })
  equipmentName: string;

  @Prop({ required: true })
  equipmentType: string; // "tecle", "escalera", etc.

  @Prop({ required: true, index: true })
  templateCode: string; // Código del formulario

  // ✅ SOLO PARA TECLES (pre-uso-contador)
  @Prop({ type: Number, default: 0 })
  preUsoCount?: number;

  @Prop({ type: [{ 
    inspectionId: String, 
    date: Date, 
    inspector: String 
  }] })
  preUsoInspections?: Array<{
    inspectionId: string;
    date: Date;
    inspector: string;
  }>;

  @Prop({ type: Boolean, default: false })
  needsFrecuenteInspection?: boolean;

  // ✅ PARA TODOS (periodicidad fija)
  @Prop({ type: Date })
  lastInspectionDate?: Date;

  @Prop({ type: Date })
  nextDueDate?: Date;

  @Prop({ type: Number })
  daysUntilDue?: number;

  // Status
  @Prop({
    type: String,
    enum: ['ok', 'due-soon', 'overdue', 'requires-frecuente'],
    default: 'ok',
  })
  status: string;

  // Metadata del equipo (auto-extraída del formulario)
  @Prop({ type: Map, of: String })
  equipmentMetadata?: Record<string, string>; // Area, Marca, Modelo, etc.

  // Timestamps automáticos
  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type EquipmentInspectionTrackingDocument = EquipmentInspectionTracking & Document;
export const EquipmentInspectionTrackingSchema = SchemaFactory.createForClass(EquipmentInspectionTracking);