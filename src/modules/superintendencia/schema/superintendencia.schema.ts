// superintendencia.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema() // Decorador para definir un esquema
export class Superintendencia extends Document {
  @Prop({ required: true }) // Decorador para definir una propiedad
  nombre: string;
}

export const SuperintendenciaSchema = SchemaFactory.createForClass(Superintendencia); // Genera el esquema