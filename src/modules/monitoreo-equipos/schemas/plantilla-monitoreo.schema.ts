import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  FOTOS_POR_FILA_MAXIMO,
  FOTOS_POR_FILA_POR_DEFECTO,
} from '../domain/reporte';

/**
 * Cómo se arma el reporte de un tipo de equipo. Por ahora solo cuántas fotos
 * van por fila; el resto del formato es fijo.
 */
@Schema({ timestamps: true, collection: 'plantillas_monitoreo' })
export class PlantillaMonitoreo extends Document {
  @Prop({ type: String, required: true, unique: true })
  tipo_equipo: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: FOTOS_POR_FILA_MAXIMO,
    default: FOTOS_POR_FILA_POR_DEFECTO,
  })
  fotos_por_fila: number;
}

export const PlantillaMonitoreoSchema =
  SchemaFactory.createForClass(PlantillaMonitoreo);
