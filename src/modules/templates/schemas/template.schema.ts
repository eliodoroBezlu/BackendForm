import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { versionadoPlantilla } from '../../../common/versionado/versionado.plugin';
import type { EstadoRevision } from '../../../common/versionado/versionado';

export type TemplateDocument = Template & Document;

@Schema()
export class VerificationField {
  @Prop({ required: true })
  label: string;

  @Prop({
    required: true,
    enum: ['text', 'date', 'number', 'select', 'autocomplete'],
  })
  type: string;

  @Prop({ type: [String] })
  options?: string[];

  @Prop({ default: false })
  required?: boolean;

  @Prop({ type: String })
  dataSource?: string;
}

@Schema()
export class Question {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  obligatorio: boolean;
}

@Schema()
export class Section {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  maxPoints: number;

  @Prop({ type: [Question], default: [] })
  questions: Question[];

  @Prop({ type: Number })
  order?: number;

  @Prop({ type: Boolean, default: false })
  isParent?: boolean;

  @Prop({ type: Types.ObjectId, default: null })
  parentId?: Types.ObjectId | null;

  subsections?: Section[];
}

export const SectionSchema = SchemaFactory.createForClass(Section);
SectionSchema.add({
  subsections: [SectionSchema],
});

@Schema()
export class SimpleQuestion {
  @Prop({ required: true })
  text: string;

  @Prop()
  image?: string;
}
@Schema()
export class SimpleSection {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: [SimpleQuestion], default: [] })
  questions: SimpleQuestion[];

  @Prop({ type: Number })
  order?: number;

  @Prop({ type: Boolean, default: false })
  isParent?: boolean;

  @Prop({ type: Types.ObjectId, default: null })
  parentId?: Types.ObjectId | null;

  subsections?: SimpleSection[];
}

export const SimpleSectionSchema = SchemaFactory.createForClass(SimpleSection);
SimpleSectionSchema.add({
  subsections: [SimpleSectionSchema],
});

@Schema({ timestamps: true })
export class Template {
  /**
   * Código de formulario (p. ej. 1.02.P06.F12). **Ya no es único**: todas
   * las revisiones de una plantilla comparten el código. La unicidad pasa a
   * `{ code, numeroRevision }` y a «una sola vigente por código» (ver
   * `versionadoPlantilla`). El índice único viejo `code_1` lo borra
   * `scripts/migrar-versionado-plantillas.cjs`.
   */
  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  revision: string;

  @Prop({
    required: true,
    enum: ['interna', 'externa'],
  })
  type: string;

  @Prop({ type: [VerificationField], required: true })
  verificationFields: VerificationField[];

  @Prop({ type: [SectionSchema], required: true })
  sections: Section[];

  @Prop({ type: [SimpleSectionSchema] })
  simpleSections?: SimpleSection[];

  @Prop({ default: true })
  isActive: boolean;

  // Campos del versionado: los declara `versionadoPlantilla` en el esquema.
  numeroRevision?: number;
  estadoRevision?: EstadoRevision;
  revisionAnteriorId?: Types.ObjectId | null;
  motivoCambio?: string;
  vigenteDesde?: Date;
  obsoletaDesde?: Date;
  publicadaPor?: string;
  creadaPor?: string;
}

// ✅ Crear el esquema principal
export const TemplateSchema = SchemaFactory.createForClass(Template);

/**
 * No se borra: pasa a inactivo y deja de aparecer en las consultas.
 *
 * Borrarlo dejaria senalando al vacio a todo lo que lo referencia.
 */
TemplateSchema.plugin(bajaLogica);

/** Borrador / vigente / obsoleta: ver `common/versionado/versionado.ts`. */
TemplateSchema.plugin(versionadoPlantilla);

// 📈 Índices útiles
TemplateSchema.index({ type: 1 });
TemplateSchema.index({ isActive: 1 });
TemplateSchema.index({ code: 1 });
