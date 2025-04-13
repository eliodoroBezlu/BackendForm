// extintor.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({timestamps: true})
export class Extintor extends Document {
  @Prop({ required: true })
  Area: string;

  @Prop({ required: true })
  CodigoExtintor: string;

  @Prop({ required: true })
  Ubicacion: string;

  @Prop({type: Boolean, default: false})
  inspeccionado: boolean;

  // @Prop({type: Boolean, default: true})
  // activo: boolean;

}

export const ExtintorSchema = SchemaFactory.createForClass(Extintor);   