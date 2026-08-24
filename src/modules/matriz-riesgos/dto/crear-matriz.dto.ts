import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Alta de una matriz vacía, sin Excel.
 *
 * El área llega por **código del maestro** y no por nombre escrito a mano: es
 * la diferencia con la importación, donde había que adivinar a qué área se
 * refería un texto tecleado en la planilla. Con el código, la superintendencia
 * sale del maestro sin ambigüedad —y de ella depende a qué PGR se consolidará
 * después.
 */
export class CrearMatrizDto {
  @ApiProperty({ example: '3310' })
  @IsString()
  areaCodigo: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ example: 'Gerencia de Mantenimiento' })
  @IsOptional()
  @IsString()
  gerencia?: string;

  @ApiPropertyOptional({
    description: 'Quién elabora. Por defecto, el usuario.',
  })
  @IsOptional()
  @IsString()
  elaboradoPor?: string;
}
