import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { Document } from "mongoose"

export type TemplateDocument = Template & Document

@Schema({timestamps: true})
export class VerificationField {
  @Prop({ required: true })
  label: string

  @Prop({
    required: true,
    enum: ["text", "date", "number", "select"],
  })
  type: string

  @Prop({ type: [String] })
  options?: string[]

  @Prop({ default: false })
  required?: boolean
}

@Schema()
export class Question {
  @Prop({ required: true })
  text: string
}

@Schema()
export class Section {

  @Prop({ required: true })
  title: string

  @Prop({ required: true, min: 0 })
  maxPoints: number

  @Prop({ type: [Question], required: true })
  questions: Question[]
}

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true, unique: true })
  code: string

  @Prop({ required: true })
  name: string

  @Prop({ required: true })
  revision: string

  @Prop({
    required: true,
    enum: ["interna", "externa"],
  })
  type: string

  @Prop({ type: [VerificationField], required: true })
  verificationFields: VerificationField[]

  @Prop({ type: [Section], required: true })
  sections: Section[]

  @Prop({ default: true })
  isActive: boolean
  
}

export const TemplateSchema = SchemaFactory.createForClass(Template)

// Índices para optimizar consultas
TemplateSchema.index({ type: 1 })
TemplateSchema.index({ isActive: 1 })
