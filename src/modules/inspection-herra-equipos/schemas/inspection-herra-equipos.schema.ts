import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { InspectionStatus } from '../types/IProps';

// ============================================
// SUB-SCHEMAS
// ============================================

@Schema({})
export class QuestionResponse {
  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  value: string | number | boolean;

  @Prop()
  observacion?: string;

  @Prop()
  description?: string;
}

@Schema({})
export class GroupedQuestionData {
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  values: Record<string, string>; // "si", "no", "na"

  @Prop({ required: true })
  observacion: string;
}

@Schema({ strict: false })
export class OutOfServiceData {
  @Prop()
  status?: string;

  @Prop()
  date?: string;

  @Prop()
  observations?: string;

  @Prop()
  tag?: string;

  @Prop()
  inspector?: string;

  @Prop()
  capacidad?: string;

  @Prop()
  tipo?: string;

  @Prop()
  fechaCorrecion?: string;
}

@Schema({})
export class DamageMarker {
  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop()
  description?: string;
}

@Schema({})
export class VehicleData {
  @Prop({ type: [DamageMarker] })
  damages?: DamageMarker[];

  @Prop()
  damageImageBase64?: string;

  @Prop()
  damageObservations?: string;

  @Prop()
  tipoInspeccion?: string;

  @Prop()
  certificacionMSC?: string;

  @Prop()
  fechaProximaInspeccion?: string;

  @Prop()
  responsableProximaInspeccion?: string;
}

@Schema({})
export class RoutineInspectionEntry {
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  inspector: string;

  @Prop({ required: true })
  response: string;

  @Prop()
  observations?: string;

  @Prop()
  signature?: string;
}

@Schema({})
export class ScaffoldData {
  @Prop({ type: [RoutineInspectionEntry] })
  routineInspections?: RoutineInspectionEntry[];

  @Prop()
  finalConclusion?: string;
}

@Schema({})
export class AccesorioConfig {
  @Prop({ required: true })
  cantidad: number;

  @Prop({ required: true })
  tipoServicio: string;
}

// ✅ NUEVO: Schema de Aprobación
@Schema({ _id: false })
export class ApprovalData {
  @Prop({ required: true, enum: ['pending', 'approved', 'rejected'] })
  status: 'pending' | 'approved' | 'rejected';

  @Prop()
  approvedBy?: string; // Email o nombre del supervisor

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop()
  supervisorComments?: string;
}

// ============================================
// SCHEMA PRINCIPAL - InspectionHerraEquipos
// ============================================

@Schema({
  timestamps: true,
  collection: 'inspections_herra_equipos',
})
export class InspectionHerraEquipos {
  _id?: mongoose.Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'TemplateHerraEquipos' })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateCode: string;

  @Prop()
  templateName?: string;

  // ============================================
  // DATOS DE VERIFICACIÓN
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  verification: Record<string, string | number>;

  // ============================================
  // RESPUESTAS DE PREGUNTAS
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  responses: Record<string, Record<string, any>>;

  // ============================================
  // OBSERVACIONES GENERALES
  // ============================================
  @Prop()
  generalObservations?: string;

  // ============================================
  // FIRMAS
  // ============================================
  @Prop({ type: MongooseSchema.Types.Mixed })
  inspectorSignature?: Record<string, string | number>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  supervisorSignature?: Record<string, string | number>;

  // ============================================
  // DATOS OPCIONALES
  // ============================================
  @Prop({ type: OutOfServiceData })
  outOfService?: OutOfServiceData;

  @Prop({ type: MongooseSchema.Types.Mixed })
  accesoriosConfig?: Record<string, AccesorioConfig>;

  @Prop({ type: VehicleData })
  vehicle?: VehicleData;

  @Prop({ type: ScaffoldData })
  scaffold?: ScaffoldData;

  @Prop({ type: [String] })
  selectedSubsections?: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  selectedItems?: Record<string, string[]>;

  // ============================================
  // METADATOS
  // ============================================
  @Prop({
    required: true,
    enum: Object.values(InspectionStatus),
    default: InspectionStatus.DRAFT,
  })
  status: InspectionStatus;

  @Prop({ required: true })
  submittedAt: Date;

  @Prop()
  submittedBy?: string;

  @Prop()
  location?: string;

  @Prop()
  project?: string;

  // ✅ NUEVOS CAMPOS DE APROBACIÓN
  @Prop({ default: false })
  requiresApproval?: boolean;

  @Prop({ type: ApprovalData })
  approval?: ApprovalData;

  // Campo denormalizado: área extraída de verification al momento de crear
  @Prop({ required: false, index: true })
  area?: string;

  // Campo denormalizado: código de equipo extraído de verification usando
  // template.campoCodigoEquipo, al momento de crear (mismo patrón que area).
  @Prop({ required: false })
  codigoEquipo?: string;

  /**
   * RFID del equipo inspeccionado, cuando lo tiene.
   *
   * Va junto a `codigoEquipo` porque el código **por sí solo dejó de
   * identificar la unidad**: en los SPCC hay pares de equipos distintos con el
   * mismo ID interno. La identidad es el par `(codigo, rfid)`, igual que en
   * `Equipo`, y sin esto no se podría saber cuál de los dos se inspeccionó.
   *
   * Vacío en herramientas y vehículos, que no llevan tag.
   */
  @Prop({ required: false, index: true })
  rfidEquipo?: string;

  // ============================================
  // BORRADO LÓGICO
  // ============================================

  /**
   * `false` cuando la inspección se dio de baja. Una inspección **nunca se
   * borra de la base**: es el registro de que alguien revisó un equipo un día
   * concreto, y eso no deja de haber ocurrido porque se dé de baja el asiento.
   *
   * ⚠️ El valor por defecto es `true`, pero los documentos anteriores a este
   * campo **no lo tienen**. Por eso todo filtro debe escribirse
   * `{ activo: { $ne: false } }` y **nunca** `{ activo: true }`: lo segundo
   * dejaría fuera a los 2047 documentos históricos y vaciaría las pantallas.
   * Ese filtro no hay que escribirlo a mano — lo pone el gancho de más abajo.
   */
  @Prop({ default: true, index: true })
  activo?: boolean;

  /** Cuándo se dio de baja. Vacío mientras siga activa. */
  @Prop({ required: false })
  eliminadaEn?: Date;

  /** Quién la dio de baja. La bitácora guarda además el documento completo. */
  @Prop({ required: false })
  eliminadaPor?: string;
}

export type InspectionHerraEquiposDocument = InspectionHerraEquipos & Document;
export const InspectionHerraEquiposSchema = SchemaFactory.createForClass(
  InspectionHerraEquipos,
);

// ============================================
// ÍNDICES PARA OPTIMIZAR BÚSQUEDAS
// ============================================
InspectionHerraEquiposSchema.index({ templateCode: 1, status: 1 });
InspectionHerraEquiposSchema.index({ submittedAt: -1 });
InspectionHerraEquiposSchema.index({ 'verification.numeroPlaca': 1 });
InspectionHerraEquiposSchema.index({ submittedBy: 1 });
// ✅ NUEVO: Índice para búsquedas de aprobación
InspectionHerraEquiposSchema.index({ status: 1, requiresApproval: 1 });
InspectionHerraEquiposSchema.index({ 'approval.status': 1 });
InspectionHerraEquiposSchema.index({ area: 1, status: 1 });
InspectionHerraEquiposSchema.index({ activo: 1, submittedAt: -1 });

// ============================================
// BORRADO LÓGICO: EXCLUSIÓN AUTOMÁTICA
// ============================================

/**
 * Las inspecciones dadas de baja quedan fuera de **toda** consulta, sin que
 * cada llamada tenga que acordarse de filtrarlas.
 *
 * Se hace aquí y no en el servicio a propósito. El servicio tiene quince
 * puntos de consulta y crecerá; filtrar en cada uno convierte cada método
 * nuevo en una ocasión de olvidarlo, y el olvido no se nota —la pantalla
 * simplemente sigue mostrando algo que se dio de baja—. Puesto en el esquema,
 * la exclusión es la norma y saltársela hay que pedirlo.
 *
 * **Cómo saltárselo:** nombrar `activo` en el filtro. `find({ activo: false })`
 * devuelve las dadas de baja y `find({ activo: { $exists: true } })` las
 * devuelve todas, porque el gancho solo actúa si nadie se pronunció.
 */
const excluirDadasDeBaja = function (this: {
  getFilter: () => Record<string, unknown>;
  where: (cond: Record<string, unknown>) => unknown;
}) {
  if (!('activo' in this.getFilter())) {
    this.where({ activo: { $ne: false } });
  }
};

// `findById` y `findByIdAndUpdate` pasan por `findOne`/`findOneAndUpdate`, así
// que quedan cubiertos sin nombrarlos.
const GANCHOS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'updateOne',
  'updateMany',
  'distinct',
] as const;

for (const gancho of GANCHOS) {
  InspectionHerraEquiposSchema.pre(gancho, excluirDadasDeBaja);
}

/**
 * Las agregaciones no llevan filtro, llevan tubería: se les antepone la etapa.
 * Sin esto, las estadísticas seguirían contando lo dado de baja —que es
 * precisamente el número que a nadie se le ocurre revisar—.
 */
InspectionHerraEquiposSchema.pre('aggregate', function () {
  const tuberia = this.pipeline();
  const yaFiltra =
    tuberia.length > 0 &&
    '$match' in tuberia[0] &&
    'activo' in
      ((tuberia[0] as { $match: Record<string, unknown> }).$match ?? {});

  if (!yaFiltra) {
    tuberia.unshift({ $match: { activo: { $ne: false } } });
  }
});
