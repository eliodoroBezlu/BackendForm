
import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MLFeedbackDto {
  @ApiProperty({ description: 'Texto de la pregunta original' })
  @IsString()
  question_text: string;

  @ApiProperty({ description: 'Puntaje actual (0-3)' })
  @IsNumber()
  current_response: number;

  @ApiProperty({ description: 'Comentario/descripción' })
  @IsString()
  comment: string;

  @ApiProperty({ description: 'Acción seleccionada por el usuario' })
  @IsString()
  accion_seleccionada: string;

  @ApiProperty({ description: '¿Fue una recomendación ML?' })
  @IsBoolean()
  fue_recomendacion_ml: boolean;

  @ApiProperty({ description: 'Índice de la recomendación (0-2)', required: false })
  @IsOptional()
  @IsNumber()
  indice_recomendacion?: number;

  @ApiProperty({ description: 'Contexto adicional' })
  @IsOptional()
  @IsObject()
  context?: {
    familia_peligro?: string;
    area?: string;
    empresa?: string;
  };

  @ApiProperty({ 
    description: 'Tipo de feedback', 
    enum: ['guardado', 'cerrado', 'aprobado', 'rechazado'] 
  })
  @IsEnum(['guardado', 'cerrado', 'aprobado', 'rechazado'])
  feedback_type: string;

  @ApiProperty({ description: 'Puntuación del feedback (-1 a +2)' })
  @IsNumber()
  feedback_score: number;
}