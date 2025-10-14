import { ApiProperty } from "@nestjs/swagger"
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  ArrayMinSize,
} from "class-validator"
import { Type } from "class-transformer"

export class CreateVerificationFieldDto {
  @ApiProperty({ description: "Etiqueta del campo" })
  @IsString()
  @IsNotEmpty()
  label: string
  
  @ApiProperty({
    description: "Tipo de campo",
    enum: ["text", "date", "number", "select", "autocomplete"],
  })
  @IsEnum(["text", "date", "number", "select", "autocomplete"])
  type: string
  
  @ApiProperty({
    description: "Opciones para campos de tipo select",
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[]
  
  @ApiProperty({ description: "Si el campo es requerido", default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean

  @ApiProperty({ description: "Fuente de datos para autocompletado", required: false })
  @IsOptional()
  @IsString()
  dataSource?: string
}

export class CreateQuestionDto {
  @ApiProperty({ description: "Texto de la pregunta" })
  @IsString()
  @IsNotEmpty()
  text: string 
  
  @ApiProperty({ description: "Si la pregunta es obligatoria", default: true })
  @IsBoolean()
  @IsNotEmpty()
  obligatorio: boolean
}

// ⭐ DTO recursivo para Section
export class CreateSectionDto {
  @ApiProperty({ description: "Título de la sección" })
  @IsString()
  @IsNotEmpty()
  title: string
  
  @ApiProperty({ description: "Descripción de la sección (opcional)", required: false })
  @IsOptional()
  @IsString()
  description?: string
  
  @ApiProperty({ description: "Puntaje máximo de la sección" })
  @IsNumber()
  @Min(0)
  maxPoints: number
  
  @ApiProperty({
    description: "Lista de preguntas de la sección",
    type: [CreateQuestionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[]
  
  @ApiProperty({ description: "Orden de la sección", required: false })
  @IsOptional()
  @IsNumber()
  order?: number
  
  @ApiProperty({ description: "Si la sección es padre (contiene subsecciones)", required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isParent?: boolean
  
  @ApiProperty({ description: "ID de la sección padre", required: false })
  @IsOptional()
  @IsString()
  parentId?: string | null
  
  // ⭐ RECURSIVIDAD: Una sección puede tener subsecciones
  @ApiProperty({
    description: "Subsecciones anidadas",
    type: [CreateSectionDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  subsections?: CreateSectionDto[]
}

export class CreateSimpleQuestionDto {
  @ApiProperty({ description: "Texto de la pregunta simple" })
  @IsString()
  @IsNotEmpty()
  text: string
  
  @ApiProperty({ description: "Imagen en base64 o URL (opcional)", required: false })
  @IsOptional()
  @IsString()
  image?: string
}

// ⭐ DTO recursivo para SimpleSection
export class CreateSimpleSectionDto {
  @ApiProperty({ description: "Título de la sección simple" })
  @IsString()
  @IsNotEmpty()
  title: string
  
  @ApiProperty({ description: "Descripción de la sección (opcional)", required: false })
  @IsOptional()
  @IsString()
  description?: string
  
  @ApiProperty({
    description: "Lista de preguntas simples de la sección",
    type: [CreateSimpleQuestionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSimpleQuestionDto)
  questions: CreateSimpleQuestionDto[]
  
  @ApiProperty({ description: "Orden de la sección", required: false })
  @IsOptional()
  @IsNumber()
  order?: number
  
  @ApiProperty({ description: "Si la sección es padre", required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isParent?: boolean
  
  @ApiProperty({ description: "ID de la sección padre", required: false })
  @IsOptional()
  @IsString()
  parentId?: string | null
  
  // ⭐ RECURSIVIDAD para SimpleSection
  @ApiProperty({
    description: "Subsecciones anidadas",
    type: [CreateSimpleSectionDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSimpleSectionDto)
  subsections?: CreateSimpleSectionDto[]
}


export class CreateTemplateDto {
  @ApiProperty({ description: "Código único del template" })
  @IsString()
  @IsNotEmpty()
  code: string
  
  @ApiProperty({ description: "Nombre del template" })
  @IsString()
  @IsNotEmpty()
  name: string
  
  @ApiProperty({ description: "Número de revisión" })
  @IsString()
  @IsNotEmpty()
  revision: string
  
  @ApiProperty({
    description: "Tipo de inspección",
    enum: ["interna", "externa"],
  })
  @IsEnum(["interna", "externa"])
  type: string
  
  @ApiProperty({
    description: "Campos de verificación",
    type: [CreateVerificationFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVerificationFieldDto)
  verificationFields: CreateVerificationFieldDto[]
  
  @ApiProperty({
    description: "Secciones del formulario",
    type: [CreateSectionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[]
  
  @ApiProperty({
    description: "Secciones simples del formulario (opcional)",
    type: [CreateSimpleSectionDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSimpleSectionDto)
  simpleSections?: CreateSimpleSectionDto[]
  
  @ApiProperty({ description: "Si el template está activo", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
  
  @ApiProperty({ description: "Usuario que crea el template", required: false })
  @IsOptional()
  @IsString()
  createdBy?: string
}