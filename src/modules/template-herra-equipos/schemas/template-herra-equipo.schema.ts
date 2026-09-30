import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { versionadoPlantilla } from '../../../common/versionado/versionado.plugin';
import type { EstadoRevision } from '../../../common/versionado/versionado';

export type ResponseType =
  | 'si_no_na'
  | 'bien_mal'
  | 'bueno_malo_na'
  | 'operativo_mantenimiento'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'textarea';

// ============================================
// SUB-SCHEMAS
// ============================================

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

  @Prop({ required: true })
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

  @Prop({ required: true })
  caption: string;

  @Prop()
  order?: number;
}

// ============================================
// SECTION (con recursión)
// ============================================

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

  subsections?: Section[];
}

// Crear schema de Section
export const SectionSchema = SchemaFactory.createForClass(Section);

// Agregar recursión manualmente
SectionSchema.add({
  subsections: [SectionSchema],
});

// ============================================
// VERIFICATION FIELD
// ============================================

@Schema({})
export class VerificationField {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  type: string;

  /** Valores ofrecidos cuando `type` es `select`. */
  @Prop({ type: [String] })
  options?: string[];

  /**
   * Con `type: select`, deja que el inspector escriba un valor que no está en
   * la lista.
   *
   * Existe porque una lista cerrada obliga a elegir mal cuando aparece un caso
   * nuevo, y ese dato mal puesto es peor que la lista incompleta. Lo que se
   * escriba se guarda tal cual —no como «Otro»— para que el reporte muestre el
   * valor real y sirva para ampliar la lista después.
   */
  @Prop({ default: false })
  permiteOtro?: boolean;

  @Prop()
  dataSource?: string;

  /**
   * Valor con el que aparece el campo la primera vez.
   *
   * Nació para `EMPRESA`, que está en escaleras, man-lift y vehículo y siempre
   * lleva lo mismo: preguntárselo al inspector en cada parte es trabajo que no
   * aporta información. Vive en la plantilla y no en el código porque es un
   * dato de negocio — el día que cambie la razón social se corrige desde el
   * constructor.
   *
   * Solo se aplica sobre un campo vacío, y el inspector puede cambiarlo.
   */
  @Prop()
  valorPorDefecto?: string;

  @Prop({ default: true }) // Set to true by default to match frontend behavior
  obligatorio?: boolean;
}

// ============================================
// FRECUENCIA DE INSPECCIÓN
// ============================================

export type UnidadFrecuencia =
  | 'diaria'
  | 'semanal'
  | 'mensual'
  | 'trimestral'
  | 'semestral'
  | 'anual'
  | 'personalizada';

@Schema({ _id: false })
export class FrecuenciaInspeccion {
  @Prop({
    required: true,
    enum: [
      'diaria',
      'semanal',
      'mensual',
      'trimestral',
      'semestral',
      'anual',
      'personalizada',
    ],
  })
  unidad: UnidadFrecuencia;

  // Solo aplica cuando unidad === 'personalizada' (cantidad de días).
  @Prop()
  valorPersonalizado?: number;

  // Permite desactivar el control de disponibilidad sin borrar la config.
  @Prop({ default: true })
  activa: boolean;
}

export const FrecuenciaInspeccionSchema =
  SchemaFactory.createForClass(FrecuenciaInspeccion);

// ============================================
// SCHEMA PRINCIPAL - TemplateHerraEquipos
// ============================================

@Schema({ timestamps: true })
export class TemplateHerraEquipos {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  revision: string;

  @Prop({ required: true, enum: ['interna', 'externa'] })
  type: string;

  @Prop()
  descripcion?: string;

  /**
   * Roles que pueden ver y llenar esta plantilla.
   *
   * Vacío (por defecto) = visible para todos, que es el comportamiento
   * histórico: así las plantillas ya existentes no cambian de alcance.
   *
   * Los roles de visibilidad total (`ROLES_VISIBILIDAD_TOTAL`) ignoran este
   * campo y ven el catálogo completo. Solo acota a los roles restringidos.
   */
  @Prop({ type: [String], default: [], index: true })
  rolesVisibles: string[];

  @Prop({ type: [VerificationField], required: true })
  verificationFields: VerificationField[];

  @Prop({ type: [SectionSchema], required: true })
  sections: Section[];

  // Label de verificationFields que identifica el código del equipo/
  // herramienta (ej. "TAG", "PLACA", "CÓDIGO DE LA ESCALERA").
  @Prop()
  campoCodigoEquipo?: string;

  // Frecuencia de inspección de este tipo de plantilla. Si no está
  // configurada (o `activa: false`), no se restringe la disponibilidad de
  // equipos — comportamiento idéntico al actual (opt-in, retrocompatible).
  @Prop({ type: FrecuenciaInspeccionSchema })
  frecuencia?: FrecuenciaInspeccion;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  // Campos del versionado: los declara `versionadoPlantilla` en el esquema.
  numeroRevision?: number;
  estadoRevision?: EstadoRevision;
  revisionAnteriorId?: mongoose.Types.ObjectId | null;
  motivoCambio?: string;
  vigenteDesde?: Date;
  obsoletaDesde?: Date;
  publicadaPor?: string;
  creadaPor?: string;
}

// ============================================
// EXPORTACIONES
// ============================================

export type TemplateHerraEquiposDocument = TemplateHerraEquipos &
  mongoose.Document;
export const TemplateHerraEquiposSchema =
  SchemaFactory.createForClass(TemplateHerraEquipos);

/**
 * No se borra: pasa a inactivo y deja de aparecer en las consultas.
 *
 * Borrarlo dejaria senalando al vacio a todo lo que lo referencia.
 */
TemplateHerraEquiposSchema.plugin(bajaLogica);

/** Borrador / vigente / obsoleta: ver `common/versionado/versionado.ts`. */
TemplateHerraEquiposSchema.plugin(versionadoPlantilla);

// ============================================
// ÍNDICES
// ============================================

TemplateHerraEquiposSchema.index({ code: 1 });
TemplateHerraEquiposSchema.index({ type: 1 });
TemplateHerraEquiposSchema.index({ createdAt: -1 });
TemplateHerraEquiposSchema.index({ name: 'text', code: 'text' });
