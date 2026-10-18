import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * El último número de código interno usado por técnica y año.
 *
 * Se reinicia cada año: COTEM139 es de octubre de 2025 y COTEM009 de enero
 * de 2026. Se incrementa con `$inc` atómico para que dos emisiones
 * simultáneas no reciban el mismo número.
 */
@Schema({ timestamps: true, collection: 'correlativos_monitoreo' })
export class CorrelativoMonitoreo extends Document {
  /** El código de la técnica: `COTEM`. */
  @Prop({ type: String, required: true })
  tecnica_codigo: string;

  @Prop({ type: Number, required: true })
  anio: number;

  @Prop({ type: Number, required: true, default: 0 })
  ultimo: number;
}

export const CorrelativoMonitoreoSchema =
  SchemaFactory.createForClass(CorrelativoMonitoreo);
CorrelativoMonitoreoSchema.index(
  { tecnica_codigo: 1, anio: 1 },
  { unique: true },
);
