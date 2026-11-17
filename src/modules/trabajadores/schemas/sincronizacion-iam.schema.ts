import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Registro de cada sincronización del padrón con el IAM: quién la hizo y qué
 * cambió. La pantalla de trabajadores muestra la última.
 */
@Schema({ timestamps: true, collection: 'sincronizaciones_iam' })
export class SincronizacionIam extends Document {
  @Prop({ required: true })
  usuario: string;

  @Prop({ default: 0 })
  nuevos: number;

  @Prop({ default: 0 })
  actualizados: number;

  @Prop({ default: 0 })
  bajas: number;

  @Prop({ default: 0 })
  fallidos: number;

  @Prop({ default: 0 })
  supervisoresGanan: number;

  @Prop({ default: 0 })
  supervisoresPierden: number;

  createdAt: Date;
}

export const SincronizacionIamSchema =
  SchemaFactory.createForClass(SincronizacionIam);
SincronizacionIamSchema.index({ createdAt: -1 });
