import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

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

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Los equipos del inventario apuntan a su clasificación: borrarla los dejaría
 * sin tipo y fuera de los listados que agrupan por ella.
 */
ClasificacionSchema.plugin(bajaLogica);
