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
    enum: ["text", "date", "number", "select"],
  })
  @IsEnum(["text", "date", "number", "select"])
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
}

export class CreateQuestionDto {
  @ApiProperty({ description: "Texto de la pregunta" })
  @IsString()
  @IsNotEmpty()
  text: string
}

export class CreateSectionDto {
  @ApiProperty({ description: "Título de la sección" })
  @IsString()
  @IsNotEmpty()
  title: string

  @ApiProperty({ description: "Puntaje máximo de la sección" })
  @IsNumber()
  @Min(0)
  maxPoints: number

  @ApiProperty({
    description: "Lista de preguntas de la sección",
    type: [CreateQuestionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[]
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

  @ApiProperty({ description: "Si el template está activo", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiProperty({ description: "Usuario que crea el template", required: false })
  @IsOptional()
  @IsString()
  createdBy?: string
}
