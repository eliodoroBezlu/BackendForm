import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

@Schema({ timestamps: true })
export class OrdenTrabajo extends Document {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  tag: string;

  @Prop({ type: String, required: true })
  area: string;

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export const OrdenTrabajoSchema = SchemaFactory.createForClass(OrdenTrabajo);

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Las ordenes de trabajo quedan citadas en las inspecciones que se hicieron
 * bajo ellas.
 */
OrdenTrabajoSchema.plugin(bajaLogica);
