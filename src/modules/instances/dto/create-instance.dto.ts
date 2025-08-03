// create-instance.dto.ts
import { ApiProperty } from "@nestjs/swagger"
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsEnum, IsObject, IsMongoId, Allow, IsNumber, Min, Max } from "class-validator"
import { Type, Transform } from "class-transformer"

export class CreateInspectionTeamMemberDto {
  @ApiProperty({ description: "Nombre del miembro del equipo" })
  @IsString()
  @IsNotEmpty()
  nombre: string

  @ApiProperty({ description: "Cargo del miembro del equipo" })
  @IsString()
  @IsNotEmpty()
  cargo: string

  @ApiProperty({ description: "Firma del miembro del equipo" })
  @IsString()
  @IsNotEmpty()
  firma: string
}

export class CreateValoracionCriterioDto {
  @ApiProperty({ 
    description: 'Valoración numérica (0-3) o N/A',
    example: 3,
  })
  @Allow()
  valoracion: number | string

  @ApiProperty({ description: "Criterio de valoración" })
  @IsString()
  @IsNotEmpty()
  criterio: string
}

export class CreateQuestionResponseDto {
  @ApiProperty({ 
    description: "Texto completo de la pregunta (snapshot histórico)",
    example: "¿Se cumple con los protocolos de seguridad?"
  })
  @IsString()
  @IsNotEmpty()
  questionText: string

  @ApiProperty({ 
    description: "Respuesta: 0, 1, 2, 3, o 'N/A'",
    example: 3,
    oneOf: [
      { type: 'number', minimum: 0, maximum: 3 },
      { type: 'string', enum: ['N/A'] }
    ]
  })
  @Transform(({ value }) => {
    if (value === 'N/A') return 'N/A';
    const num = Number(value);
    return !isNaN(num) ? num : value;
  })
  @Allow()
  response: number | string

  @ApiProperty({ 
    description: "Puntaje obtenido: 0 si N/A, sino igual al response numérico",
    example: 3
  })
  @IsNumber()
  @Min(0)
  @Max(3)
  points: number

  @ApiProperty({ 
    description: "Comentario específico de esta pregunta",
    required: false
  })
  @IsOptional()
  @IsString()
  comment?: string
}

export class CreateSectionResponseDto {
  @ApiProperty({ 
    description: "ID de la sección del template",
    example: "687c005cfc476b634364683b"
  })
  @IsString()
  @IsNotEmpty()
  sectionId: string

  @ApiProperty({
    description: "Array de respuestas de preguntas",
    type: [CreateQuestionResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionResponseDto)
  questions: CreateQuestionResponseDto[]

  @ApiProperty({ 
    description: "Máximo teórico de puntos posibles",
    example: 27
  })
  @IsNumber()
  @Min(0)
  maxPoints: number

  @ApiProperty({ 
    description: "Puntos realmente obtenidos",
    example: 20
  })
  @IsNumber()
  @Min(0)
  obtainedPoints: number

  @ApiProperty({ 
    description: "Puntos aplicables (excluyendo N/A)",
    example: 24
  })
  @IsNumber()
  @Min(0)
  applicablePoints: number

  @ApiProperty({ 
    description: "Cantidad de preguntas marcadas como N/A",
    example: 1
  })
  @IsNumber()
  @Min(0)
  naCount: number

  @ApiProperty({ 
    description: "Porcentaje de cumplimiento de la sección",
    example: 83.33,
    minimum: 0,
    maximum: 100
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  compliancePercentage: number

  @ApiProperty({ 
    description: "Comentario general de la sección",
    required: false
  })
  @IsOptional()
  @IsString()
  sectionComment?: string
}

export class CreateInstanceDto {
  @ApiProperty({ description: "ID del template utilizado" })
  @IsMongoId()
  templateId: string

  @ApiProperty({
    description: "Lista de verificación",
    type: "object",
    additionalProperties: { type: "string" },
  })
  @IsObject()
  verificationList: Record<string, string>

  @ApiProperty({
    description: "Equipo de inspección",
    type: [CreateInspectionTeamMemberDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInspectionTeamMemberDto)
  inspectionTeam: CreateInspectionTeamMemberDto[]

  @ApiProperty({
    description: "Criterios de valoración",
    type: [CreateValoracionCriterioDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateValoracionCriterioDto)
  valoracionCriterio: CreateValoracionCriterioDto[]

  @ApiProperty({
    description: "Respuestas organizadas por secciones",
    type: [CreateSectionResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionResponseDto)
  sections: CreateSectionResponseDto[]

  @ApiProperty({ description: "Aspectos positivos encontrados", required: false })
  @IsOptional()
  @IsString()
  aspectosPositivos?: string

  @ApiProperty({ description: "Aspectos adicionales encontrados", required: false })
  @IsOptional()
  @IsString()
  aspectosAdicionales?: string

  // Campos calculados automáticamente
  @ApiProperty({ 
    description: "Suma de obtainedPoints de todas las secciones",
    example: 85
  })
  @IsNumber()
  @Min(0)
  totalObtainedPoints: number

  @ApiProperty({ 
    description: "Suma de applicablePoints de todas las secciones",
    example: 95
  })
  @IsNumber()
  @Min(0)
  totalApplicablePoints: number

  @ApiProperty({ 
    description: "Suma de maxPoints de todas las secciones",
    example: 100
  })
  @IsNumber()
  @Min(0)
  totalMaxPoints: number

  @ApiProperty({ 
    description: "Total de preguntas N/A en toda la instancia",
    example: 2
  })
  @IsNumber()
  @Min(0)
  totalNaCount: number

  @ApiProperty({ 
    description: "Porcentaje general de cumplimiento",
    example: 89.47,
    minimum: 0,
    maximum: 100
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  overallCompliancePercentage: number

  @ApiProperty({
    description: "Estado de la instancia",
    enum: ["borrador", "completado", "revisado", "aprobado"],
    default: "borrador",
  })
  @IsOptional()
  @IsEnum(["borrador", "completado", "revisado", "aprobado"])
  status?: string

  @ApiProperty({ description: "Usuario que crea la instancia", required: false })
  @IsOptional()
  @IsString()
  createdBy?: string
}