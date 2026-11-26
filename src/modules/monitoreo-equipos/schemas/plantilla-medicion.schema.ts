import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PiezaDeMedicion } from '../domain/espesores';
import { DiagramaDeMedicion } from '../domain/reporte';

/**
 * La grilla con que se mide un tag con una técnica (p. ej. 250SA225 con
 * ULTRASONIDO ACTIVO). Cuando un reporte elige ese tag y esa técnica, nace
 * con una copia de esta grilla y de sus diagramas.
 */
@Schema({ timestamps: true, collection: 'plantillas_medicion' })
export class PlantillaMedicion extends Document {
  /** En mayúsculas, como el código del equipo. */
  @Prop({ type: String, required: true })
  tag: string;

  /** La técnica como está en su lista. */
  @Prop({ type: String, required: true })
  tecnica: string;

  /** Para buscar sin depender de tildes ni mayúsculas (`normalizarValor`). */
  @Prop({ type: String, required: true })
  tecnica_normalizada: string;

  @Prop({ type: String, required: true })
  titulo: string;

  @Prop({ type: [Object], required: true })
  piezas: PiezaDeMedicion[];

  /** Los dibujos del equipo con sus puntos (las piezas 1–6, la válvula A–D). */
  @Prop({ type: [Object], default: [] })
  diagramas: DiagramaDeMedicion[];

  @Prop({ type: String })
  actualizadoPor?: string;
}

export const PlantillaMedicionSchema =
  SchemaFactory.createForClass(PlantillaMedicion);
PlantillaMedicionSchema.index(
  { tag: 1, tecnica_normalizada: 1 },
  { unique: true },
);
