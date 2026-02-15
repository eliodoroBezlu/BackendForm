import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Trabajador extends Document {
  @Prop({ required: true, unique: true, index: true })
  ci: string;

  @Prop({ required: true })
  nomina: string;

  @Prop({ required: true })
  puesto: string;

  @Prop({ required: true })
  fecha_ingreso: Date;

  @Prop({ required: true })
  superintendencia: string;

  // ✅ RELACIÓN CON EL SISTEMA DE AUTH PROPIO
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId; // Relación con tu User de auth

  @Prop({ required: false })
  username?: string; // Para búsqueda rápida

  @Prop({ default: false })
  tiene_acceso_sistema: boolean;

  @Prop({ default: true })
  activo: boolean;

  // Auditoría
  @Prop({ required: false })
  creado_por_usuario?: string;

  @Prop({ required: false })
  user_disabled?: boolean;

  @Prop({ required: false })
  user_disabled_reason?: string;

  @Prop({ required: false })
  user_disabled_by?: string;

  @Prop({ required: false })
  user_disabled_at?: Date;

  @Prop({ required: false })
  user_unlinked?: boolean;

  @Prop({ required: false })
  user_unlinked_reason?: string;

  @Prop({ required: false })
  user_unlinked_by?: string;

  @Prop({ required: false })
  user_unlinked_at?: Date;
}

export const TrabajadorSchema = SchemaFactory.createForClass(Trabajador);

// Índices
TrabajadorSchema.index({ ci: 1 });
TrabajadorSchema.index({ username: 1 });
TrabajadorSchema.index({ userId: 1 });