import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CambiarEstadoMatrizDto {
  @ApiPropertyOptional({
    description: 'Queda en el historial junto al cambio de estado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

export class DevolverMatrizDto {
  @ApiPropertyOptional({
    description: 'Por qué se devuelve. Se le muestra a quien la elaboró.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}
