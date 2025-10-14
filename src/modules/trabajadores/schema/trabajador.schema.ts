import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true }) // Agrega createdAt y updatedAt automáticamente
export class Trabajador extends Document {
  @Prop({ required: true, unique: true })
  ci: string;

  @Prop({ required: true })
  nomina: string;

  @Prop({ required: true })
  puesto: string;

  @Prop({ required: true })
  fecha_ingreso: Date;

  @Prop({ required: true })
  superintendencia: string;
  
  @Prop({ default: true })
  activo: boolean;
}

export const TrabajadorSchema = SchemaFactory.createForClass(Trabajador);