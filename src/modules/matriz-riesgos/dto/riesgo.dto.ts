import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CALIDADES_CONTROL } from '../domain/eficacia-control.util';

/**
 * Un control del riesgo.
 *
 * No lleva `eficacia`: es derivada de calidad × jerarquía y la calcula el
 * servidor. Aceptarla del cliente permitiría declarar eficaz un control que no
 * lo es y bajar el nivel del riesgo por la puerta de atrás.
 */
export class ControlDto {
  @ApiProperty({ example: 'Administrativo' })
  @IsString()
  familiaControl: string;

  @ApiProperty({ example: 'Capacitar al personal sobre trabajo en altura' })
  @IsString()
  medida: string;

  @ApiPropertyOptional({ example: 'Inspecciones' })
  @IsOptional()
  @IsString()
  familiaVerificador?: string;

  @ApiProperty({
    example: 'Seguimiento al programa de inspecciones ISOP',
    description: 'Es el puente hacia el PGR: sin él el control no es medible.',
  })
  @IsString()
  verificador: string;

  @ApiProperty({ enum: CALIDADES_CONTROL })
  @IsIn(CALIDADES_CONTROL as readonly string[])
  calidadControl: string;

  @ApiProperty({ example: '2. Administrativo/ Procedimientos/ Capacitación' })
  @IsString()
  jerarquiaControl: string;
}

/**
 * Un riesgo con sus controles.
 *
 * Se manda **entero** —riesgo y controles juntos— y no control por control,
 * porque el nivel residual depende del conjunto: guardar un control suelto
 * dejaría el nivel calculado sobre una foto incompleta.
 *
 * No lleva el encabezado (área, actividad, condición, categoría): eso es de la
 * actividad, y la actividad va en la ruta.
 *
 * Tampoco lleva los derivados (probabilidad, resultado, nivelInicial,
 * nivelActual): salen de `evaluarRiesgoCompleto` en cada escritura.
 */
export class RiesgoDto {
  @ApiProperty({ example: 'Trabajos en altura' })
  @IsString()
  familiaPeligro: string;

  @ApiProperty({ example: 'Trabajo sobre plataforma sin barandas' })
  @IsString()
  descripcionPeligro: string;

  @ApiProperty({ example: 'Caída de distinto nivel' })
  @IsString()
  familiaRiesgo: string;

  @ApiProperty({ example: 'Caída desde altura con traumatismos graves' })
  @IsString()
  descripcionRiesgo: string;

  @ApiProperty({ minimum: 1, maximum: 6 })
  @IsInt()
  @Min(1)
  @Max(6)
  exposicion: number;

  @ApiProperty({ minimum: 1, maximum: 6 })
  @IsInt()
  @Min(1)
  @Max(6)
  posibilidad: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  severidad: number;

  @ApiProperty({
    type: [ControlDto],
    description:
      'Al menos uno: un riesgo sin controles no puede reducir su nivel.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ControlDto)
  controles: ControlDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentesOcurridos?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trazabilidad?: string;
}
