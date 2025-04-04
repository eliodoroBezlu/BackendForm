import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class OrdenTrabajo extends Document {
  @Prop({ 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  })
  tag: string;

  @Prop({ type: String, required: true })
  area: string;
}

export const OrdenTrabajoSchema = SchemaFactory.createForClass(OrdenTrabajo);