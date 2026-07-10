import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'clasificaciones' })
export class Clasificacion extends Document {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  nombre: string;

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export type ClasificacionDocument = Clasificacion & Document;
export const ClasificacionSchema = SchemaFactory.createForClass(Clasificacion);
