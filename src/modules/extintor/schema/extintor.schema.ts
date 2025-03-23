// extintor.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Extintor extends Document {
  @Prop({ required: true })
  Area: string;

  @Prop({ required: true })
  CodigoExtintor: string;

  @Prop({ required: true })
  Ubicacion: string;
}

export const ExtintorSchema = SchemaFactory.createForClass(Extintor);   