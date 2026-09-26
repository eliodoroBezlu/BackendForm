import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

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

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Los equipos apuntan a su ubicacion; borrarla los dejaria sin sitio.
 */
UbicacionSchema.plugin(bajaLogica);
