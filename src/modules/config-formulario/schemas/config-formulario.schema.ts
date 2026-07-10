import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class CampoFormulario {
  @Prop({ required: true })
  name: string; // ID único del atributo (ej: "voltaje")

  @Prop({ required: true })
  label: string; // Título amigable (ej: "Voltaje")

  @Prop({ required: true })
  type: string; // "text" | "number" | "select" | "boolean"

  @Prop({ default: false })
  required: boolean;

  @Prop({ type: [String] })
  options?: string[]; // Para tipos select
}

@Schema({ timestamps: true, collection: 'config_formularios' })
export class ConfigFormulario extends Document {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  tipo_equipo: string; // "Escalera", "Amoladora", "EquiposSoldar", etc.

  @Prop({ type: [CampoFormulario], required: true })
  campos: CampoFormulario[];
}

export type ConfigFormularioDocument = ConfigFormulario & Document;
export const ConfigFormularioSchema = SchemaFactory.createForClass(ConfigFormulario);
