// create-instance.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsObject,
  IsMongoId,
  Allow,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateInspectionTeamMemberDto {
  @ApiProperty({ description: 'Nombre del miembro del equipo' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ description: 'Cargo del miembro del equipo' })
  @IsString()
  @IsNotEmpty()
  cargo: string;

  @ApiProperty({ description: 'Firma del miembro del equipo' })
  @IsString()
  @IsNotEmpty()
  firma: string;
}

export class CreateValoracionCriterioDto {
  @ApiProperty({
    description: 'Valoración numérica (0-3) o N/A',
    example: 3,
  })
  @Allow()
  valoracion: number | string;

  @ApiProperty({ description: 'Criterio de valoración' })
  @IsString()
  @IsNotEmpty()
  criterio: string;
}

export class CreateQuestionResponseDto {
  @ApiProperty({
    description: 'Texto completo de la pregunta (snapshot histórico)',
    example: '¿Se cumple con los protocolos de seguridad?',
  })
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @ApiProperty({
    description: "Respuesta: 0, 1, 2, 3, o 'N/A'",
    example: 3,
    oneOf: [
      { type: 'number', minimum: 0, maximum: 3 },
      { type: 'string', enum: ['N/A', ''] },
    ],
  })
  @Transform(({ value }) => {
    if (value === 'N/A' || value === '') return value;
    const num = Number(value);
    return !isNaN(num) ? num : value;
  })
  @Allow()
  response: number | string;

  @ApiProperty({
    description: 'Puntaje obtenido (calculado automáticamente por el backend)',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3)
  points?: number;

  @ApiProperty({
    description: 'Comentario específico de esta pregunta',
    required: false,
  })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateSectionResponseDto {
  @ApiProperty({
    description: 'ID de la sección del template',
    example: '687c005cfc476b634364683b',
  })
  @IsString()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty({
    description: 'Array de respuestas de preguntas',
    type: [CreateQuestionResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionResponseDto)
  questions: CreateQuestionResponseDto[];

  // ✅ CAMPOS CALCULADOS OPCIONALES (el backend los calcula)
  @ApiProperty({
    description: 'Máximo teórico de puntos posibles (calculado por backend)',
    example: 27,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPoints?: number;

  @ApiProperty({
    description: 'Puntos realmente obtenidos (calculado por backend)',
    example: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  obtainedPoints?: number;

  @ApiProperty({
    description: 'Puntos aplicables (calculado por backend)',
    example: 24,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  applicablePoints?: number;

  @ApiProperty({
    description: 'Cantidad de preguntas N/A (calculado por backend)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  naCount?: number;

  @ApiProperty({
    description: 'Porcentaje de cumplimiento (calculado por backend)',
    example: 83.33,
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  compliancePercentage?: number;

  @ApiProperty({
    description: 'Comentario general de la sección',
    required: false,
  })
  @IsOptional()
  @IsString()
  sectionComment?: string;
}

export class CreatePersonalInvolucradoDto {
  @ApiProperty({ description: 'Nombre completo del personal involucrado' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ description: 'Cédula de identidad (C.I.)' })
  @IsString()
  @IsNotEmpty()
  ci: string;
}

export class CreateInstanceDto {
  @ApiProperty({ description: 'ID del template utilizado' })
  @IsMongoId()
  templateId: string;

  @ApiProperty({
    description: 'Lista de verificación',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  verificationList: Record<string, string>;

  @ApiProperty({
    description: 'Equipo de inspección',
    type: [CreateInspectionTeamMemberDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInspectionTeamMemberDto)
  inspectionTeam: CreateInspectionTeamMemberDto[];

  @ApiProperty({
    description: 'Criterios de valoración',
    type: [CreateValoracionCriterioDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateValoracionCriterioDto)
  valoracionCriterio: CreateValoracionCriterioDto[];

  @ApiProperty({
    description: 'Respuestas organizadas por secciones',
    type: [CreateSectionResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionResponseDto)
  sections: CreateSectionResponseDto[];

  @ApiProperty({
    description: 'Aspectos positivos encontrados',
    required: false,
  })
  @IsOptional()
  @IsString()
  aspectosPositivos?: string;

  @ApiProperty({
    description: 'Aspectos adicionales encontrados',
    required: false,
  })
  @IsOptional()
  @IsString()
  aspectosAdicionales?: string;

  @ApiProperty({
    description: 'Lista del personal involucrado en el trabajo',
    type: [CreatePersonalInvolucradoDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalInvolucradoDto)
  personalInvolucrado?: CreatePersonalInvolucradoDto[];

  // ✅ CAMPOS TOTALES OPCIONALES - El backend los calcula automáticamente
  @ApiProperty({
    description: 'Suma de obtainedPoints (calculado automáticamente)',
    example: 85,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalObtainedPoints?: number;

  @ApiProperty({
    description: 'Suma de applicablePoints (calculado automáticamente)',
    example: 95,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalApplicablePoints?: number;

  @ApiProperty({
    description: 'Suma de maxPoints (calculado automáticamente)',
    example: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalMaxPoints?: number;

  @ApiProperty({
    description: 'Total de preguntas N/A (calculado automáticamente)',
    example: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalNaCount?: number;

  @ApiProperty({
    description: 'Porcentaje general de cumplimiento (calculado automáticamente)',
    example: 89.47,
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overallCompliancePercentage?: number;

  @ApiProperty({
    description: 'Estado de la instancia',
    enum: ['borrador', 'completado', 'revisado', 'aprobado'],
    default: 'borrador',
  })
  @IsOptional()
  @IsEnum(['borrador', 'completado', 'revisado', 'aprobado'])
  status?: string;

  @ApiProperty({
    description: 'Usuario que crea la instancia',
    required: false,
  })
  @IsOptional()
  @IsString()
  createdBy?: string;
}