// area.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Superintendencia } from '../../superintendencia/schema/superintendencia.schema';
import * as mongoose from 'mongoose';

@Schema() // Define que esta clase es un esquema de Mongoose
export class Area extends Document {
  @Prop({ required: true }) // Define una propiedad con validación "required"
  nombre: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId, // Tipo de dato: ObjectId
    ref: 'Superintendencia', // Referencia a la colección Superintendencia
    required: true,
  })
  superintendencia: Superintendencia; // Relación con Superintendencia

  @Prop({ default: true })
activo: boolean;

@Prop()
creadoPor: string;

@Prop()
actualizadoPor: string;
}

export const AreaSchema = SchemaFactory.createForClass(Area); // Crea el esquema