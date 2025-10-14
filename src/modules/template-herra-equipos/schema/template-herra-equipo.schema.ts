import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type ResponseType =
  | 'si_no_na'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'textarea';

@Schema({})
export class ResponseOption {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  value: string | number | boolean;

  @Prop()
  color?: string;
}

@Schema({})
export class ResponseConfig {
  @Prop({ required: true })
  type: ResponseType;

  @Prop({ type: [ResponseOption] })
  options?: ResponseOption[];

  @Prop()
  placeholder?: string;

  @Prop()
  min?: number;

  @Prop()
  max?: number;
}

@Schema({})
export class QuestionImage {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true }) // ← Cambio: ahora es obligatorio
  caption: string;
}

@Schema({})
export class Question {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  obligatorio: boolean;

  @Prop({ type: ResponseConfig, required: true })
  responseConfig: ResponseConfig;

  @Prop()
  order?: number;

  @Prop({ type: QuestionImage })
  image?: QuestionImage;
}

@Schema({})
export class SectionImage {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true }) // ← Cambio: ahora es obligatorio
  caption: string;

  @Prop()
  order?: number;
}

// ← IMPORTANTE: Definir la clase Section ANTES del SchemaFactory
@Schema({})
export class Section {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: [SectionImage] })
  images?: SectionImage[];

  @Prop({ type: [Question], required: true })
  questions: Question[];

  @Prop()
  order?: number;

  @Prop({ default: false })
  isParent?: boolean;

  @Prop({ type: mongoose.Schema.Types.String, default: null })
  parentId?: string | null;

  // ← RECURSIÓN: Section puede contener más Sections
  //@Prop({ type: [Section] })
  subsections?: Section[];
}

// Crear el schema DESPUÉS de definir la clase
export const SectionSchema = SchemaFactory.createForClass(Section);

// ← CRUCIAL: Registrar el schema recursivo manualmente
SectionSchema.add({
  subsections: [SectionSchema]
});

@Schema({})
export class VerificationField {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: [String] })
  options?: string[];

  @Prop()
  dataSource?: string;
}

@Schema({ timestamps: true })
export class TemplateHerraEquipos extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  revision: string;

  @Prop({ required: true, enum: ['interna', 'externa'] })
  type: string;

  @Prop({ type: [VerificationField], required: true })
  verificationFields: VerificationField[];

  @Prop({ type: [SectionSchema], required: true }) // ← Usar SectionSchema
  sections: Section[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TemplateHerraEquiposSchema = SchemaFactory.createForClass(TemplateHerraEquipos);

// Índices para mejor performance
TemplateHerraEquiposSchema.index({ code: 1 });
TemplateHerraEquiposSchema.index({ type: 1 });
TemplateHerraEquiposSchema.index({ createdAt: -1 });
TemplateHerraEquiposSchema.index({ name: 'text', code: 'text' }); // Para búsqueda