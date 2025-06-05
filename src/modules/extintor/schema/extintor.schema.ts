// extintor.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({timestamps: true})
export class Extintor extends Document {
  @Prop({ required: true })
  area: string;

  @Prop({ required: true })
  tag: string;

  @Prop({ required: true, unique: true })
  CodigoExtintor: string;

  @Prop({ required: true })
  Ubicacion: string;

  @Prop({type: Boolean, default: false})
  inspeccionado: boolean;

  @Prop({type: Boolean, default: true})
  activo: boolean;

}

export const ExtintorSchema = SchemaFactory.createForClass(Extintor);   