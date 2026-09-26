// extintor.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

@Schema({ timestamps: true })
export class Extintor extends Document {
  @Prop({ required: true })
  area: string;

  @Prop({ required: true })
  tag: string;

  @Prop({ required: true, unique: true })
  CodigoExtintor: string;

  @Prop({ required: true })
  Ubicacion: string;

  @Prop({ type: Boolean, default: false })
  inspeccionado: boolean;

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export const ExtintorSchema = SchemaFactory.createForClass(Extintor);

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Las inspecciones de emergencia apuntan al extintor: borrarlo dejaria el
 * historial senalando a un identificador que ya no existe.
 */
ExtintorSchema.plugin(bajaLogica);
