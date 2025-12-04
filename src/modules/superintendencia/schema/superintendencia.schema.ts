// superintendencia.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Superintendencia extends Document {
  @Prop({ required: true })
  nombre: string;

  @Prop({ default: true })
  activo: boolean;

  @Prop()
  creadoPor: string;

  @Prop()
  actualizadoPor: string;
}

export const SuperintendenciaSchema = SchemaFactory.createForClass(Superintendencia); // Genera el esquema