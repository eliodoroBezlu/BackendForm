// import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
// import { Document } from 'mongoose';

// @Schema({ timestamps: true }) // Agrega createdAt y updatedAt automáticamente
// export class Trabajador extends Document {
//   @Prop({ required: true, unique: true })
//   ci: string;

//   @Prop({ required: true })
//   nomina: string;

//   @Prop({ required: true })
//   puesto: string;

//   @Prop({ required: true })
//   fecha_ingreso: Date;

//   @Prop({ required: true })
//   superintendencia: string;
  
//   @Prop({ default: true })
//   activo: boolean;
// }

// export const TrabajadorSchema = SchemaFactory.createForClass(Trabajador);

import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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

  // Campos para asociación con Keycloak
  @Prop({ required: false })
  keycloak_user_id?: string;

  @Prop({ required: false })
  username?: string;

  @Prop({ default: false })
  tiene_acceso_sistema: boolean;

  @Prop({ default: true })
  activo: boolean;

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
  user_enabled_by?: string;

  @Prop({ required: false })
  user_enabled_at?: Date;

  @Prop({ required: false })
  user_unlinked?: boolean;

  @Prop({ required: false })
  user_unlinked_reason?: string;

  @Prop({ required: false })
  user_unlinked_by?: string;

  @Prop({ required: false })
  user_unlinked_at?: Date;

  @Prop({ required: false })
  updatedBy?: string;
}

export const TrabajadorSchema = SchemaFactory.createForClass(Trabajador);