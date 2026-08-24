import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Lo mínimo de un control para poder evaluarlo.
 *
 * A diferencia de `ControlDto` no exige verificador ni medida: la
 * previsualización corre mientras el formulario todavía está a medio llenar.
 */
export class ControlEvaluableDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  calidadControl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jerarquiaControl?: string;
}

/**
 * Entrada de la vista previa del nivel de riesgo.
 *
 * Existe para que el formulario **no reimplemente la metodología**: la tabla
 * 6×6, la de eficacia y las ramas del nivel residual —con la excepción de
 * BAJA— viven en un solo lugar. Si el navegador las copiara, cualquier
 * corrección en el motor dejaría la vista previa mintiendo hasta el siguiente
 * despliegue del frontend.
 */
export class PrevisualizarRiesgoDto {
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

  @ApiProperty({ type: [ControlEvaluableDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ControlEvaluableDto)
  controles: ControlEvaluableDto[];
}
