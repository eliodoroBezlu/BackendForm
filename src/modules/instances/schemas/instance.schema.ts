import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type Document, Types } from "mongoose"
import * as mongoose from "mongoose"

export type InstanceDocument = Instance & Document

@Schema({ timestamps: true })
export class InspectionTeamMember {
  @Prop({ required: true })
  nombre: string

  @Prop({ required: true })
  cargo: string

  @Prop({ required: true })
  firma: string
}

@Schema()
export class ValoracionCriterio {
  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  valoracion: number | string

  @Prop({ required: true })
  criterio: string
}

// Nueva clase para las respuestas de preguntas individuales
@Schema()
export class QuestionResponse {
  @Prop({ required: true })
  questionText: string // Texto completo de la pregunta (snapshot histórico)

  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  response: string | number // 0, 1, 2, 3, o "N/A"

  @Prop({ required: true, type: Number })
  points: number // Puntaje obtenido: 0 si N/A, sino igual al response numérico

  @Prop()
  comment?: string // Comentario específico de esta pregunta
}

// Nueva clase para las respuestas por sección
@Schema()
export class SectionResponse {
  @Prop({ required: true })
  sectionId: string // ID de la sección del template

  @Prop({ type: [QuestionResponse], required: true })
  questions: QuestionResponse[]

  // Campos calculados para la sección
  @Prop({ required: true, type: Number })
  maxPoints: number // Máximo teórico de puntos posibles (copiado del template)

  @Prop({ required: true, type: Number })
  obtainedPoints: number // Puntos realmente obtenidos (suma de points donde response != "N/A")

  @Prop({ required: true, type: Number })
  applicablePoints: number // Puntos aplicables (maxPoints - puntos de preguntas "N/A")

  @Prop({ required: true, type: Number })
  naCount: number // Cantidad de preguntas marcadas como "N/A"

  @Prop({ required: true, type: Number, min: 0, max: 100 })
  compliancePercentage: number // Porcentaje de cumplimiento: (obtainedPoints/applicablePoints) × 100

  @Prop()
  sectionComment?: string // Comentario general de la sección
}

@Schema({ timestamps: true })
export class Instance {
  @Prop({ type: Types.ObjectId, ref: "Template", required: true })
  templateId: Types.ObjectId

  @Prop({ type: Map, of: String, required: true })
  verificationList: Map<string, string>

  @Prop({ type: [InspectionTeamMember], required: true })
  inspectionTeam: InspectionTeamMember[]

  @Prop({ type: [ValoracionCriterio], required: true })
  valoracionCriterio: ValoracionCriterio[]

  // Aquí está el cambio principal: respuestas organizadas por secciones
  @Prop({ type: [SectionResponse], required: true })
  sections: SectionResponse[]

  @Prop()
  aspectosPositivos?: string

  @Prop()
  aspectosAdicionales?: string

  // Campos calculados automáticamente para toda la instancia
  @Prop({ required: true, type: Number })
  totalObtainedPoints: number // Suma de obtainedPoints de todas las secciones

  @Prop({ required: true, type: Number })
  totalApplicablePoints: number // Suma de applicablePoints de todas las secciones

  @Prop({ required: true, type: Number })
  totalMaxPoints: number // Suma de maxPoints de todas las secciones

  @Prop({ required: true, type: Number })
  totalNaCount: number // Total de preguntas "N/A" en toda la instancia

  @Prop({ required: true, type: Number, min: 0, max: 100 })
  overallCompliancePercentage: number // Porcentaje general: (totalObtainedPoints/totalApplicablePoints) × 100

  @Prop({
    enum: ["borrador", "completado", "revisado", "aprobado"],
    default: "borrador",
  })
  status: string

  @Prop()
  createdBy?: string

  @Prop()
  updatedBy?: string

  @Prop()
  reviewedBy?: string

  @Prop()
  approvedBy?: string

  @Prop()
  reviewedAt?: Date

  @Prop()
  approvedAt?: Date
}

export const InstanceSchema = SchemaFactory.createForClass(Instance)

// Índices para optimizar consultas
InstanceSchema.index({ templateId: 1 })
InstanceSchema.index({ status: 1 })
InstanceSchema.index({ createdAt: -1 })
InstanceSchema.index({ "verificationList.fechaInspeccion": 1 })
InstanceSchema.index({ "sections.sectionId": 1 }) // Para consultas por sección
InstanceSchema.index({ overallCompliancePercentage: -1 }) // Para ranking por porcentaje general
InstanceSchema.index({ totalObtainedPoints: -1 }) // Para ranking por puntaje total
InstanceSchema.index({ "sections.compliancePercentage": -1 }) // Para análisis por sección