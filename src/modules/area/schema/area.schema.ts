// area.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Superintendencia } from '../../superintendencia/schema/superintendencia.schema';

@Schema() // Define que esta clase es un esquema de Mongoose
export class Area extends Document {
  // Código JDE del área — clave de sincronización con el catálogo del IAM
  // Core. Opcional/sparse porque las áreas creadas antes de la sincronización
  // no lo tienen hasta que el sync las empareja por nombre.
  @Prop({ unique: true, sparse: true })
  codigo?: string;

  @Prop({ required: true }) // Define una propiedad con validación "required"
  nombre: string;

  @Prop({
    type: Types.ObjectId, // Tipo de dato: ObjectId
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
