// src/modules/ml-recommendations/dto/get-recommendation.dto.ts

import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetRecommendationDto {
  @ApiProperty({
    description: 'Texto de la pregunta u observación',
    example: 'Escalera sin barandal de seguridad',
  })
  @IsString()
  question_text: string;

  @ApiProperty({
    description: 'Puntaje actual de la observación (0-3)',
    example: 0,
    minimum: 0,
    maximum: 3,
  })
  @IsNumber()
  current_response: number;

  @ApiPropertyOptional({
    description: 'Comentario adicional sobre la observación',
    example: 'Se observó escalera metálica sin barandal lateral',
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({
    description: 'Contexto adicional para mejorar las recomendaciones',
    example: {
      sectionCompliance: 75,
      overallCompliance: 80,
      area: 'Producción',
      naCount: 2,
    },
  })
  @IsOptional()
  @IsObject()
  context?: {
    sectionCompliance?: number;
    overallCompliance?: number;
    area?: string;
    naCount?: number;
  };
}