import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

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

  @Prop({ required: true })
  area: string;

  @Prop({ required: false })
  jde?: string;

  @Prop({ required: false })
  no_bloque?: string;

  @Prop({ required: false })
  no_habitacion?: string;

  @Prop({ required: false })
  residencia?: string;

  @Prop({ required: false })
  celular?: string;

  // ✅ RELACIÓN CON EL SISTEMA DE AUTH PROPIO
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId; // Relación con tu User de auth

  @Prop({ required: false })
  username?: string; // Para búsqueda rápida

  // Roles que este trabajador tiene en el servicio "forms" según el IAM Core
  // (fuente de verdad), ej. ["supervisor"]. Se refresca por sincronización,
  // nunca se edita a mano — para eso está IAM Portal.
  @Prop({ type: [String], default: [] })
  roles_iam: string[];

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

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Una persona que deja la empresa no deja de figurar en las inspecciones que
 * firmo ni en las entregas que recibio.
 */
TrabajadorSchema.plugin(bajaLogica);

// Índices
TrabajadorSchema.index({ ci: 1 });
TrabajadorSchema.index({ username: 1 });
TrabajadorSchema.index({ userId: 1 });
