// ========== filtros-plan-accion.dto.ts ==========
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FiltrosPlanAccionDto {
  @ApiProperty({ required: false, enum: ['abierto', 'en-progreso', 'cerrado'] })
  @IsOptional()
  @IsEnum(['abierto', 'en-progreso', 'cerrado'])
  estado?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vicepresidencia?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  superintendencia?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  areaFisica?: string;
}