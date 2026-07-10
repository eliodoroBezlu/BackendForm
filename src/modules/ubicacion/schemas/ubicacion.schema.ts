import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Ubicacion extends Document {
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

export type UbicacionDocument = Ubicacion & Document;
export const UbicacionSchema = SchemaFactory.createForClass(Ubicacion);
