import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InspectionScheduleDocument = InspectionSchedule & Document;

@Schema({ timestamps: true })
export class InspectionSchedule {
  @Prop({ type: Types.ObjectId, required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateName: string;

  @Prop({ required: true })
  area: string;

  @Prop({ required: true })
  managementYear: number;

  @Prop({ type: Date })
  firstSemesterDueDate?: Date;

  @Prop({ type: Date })
  secondSemesterDueDate?: Date;

  @Prop({ type: Date })
  firstSemesterCompletionDate?: Date;

  @Prop({ type: Date })
  secondSemesterCompletionDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Instance' })
  instanceId?: Types.ObjectId;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: false })
  hasValidSchedule: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const InspectionScheduleSchema = SchemaFactory.createForClass(InspectionSchedule);