import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Datos que acompañan al archivo al **confirmar** una importación.
 *
 * Nótese que aquí no viajan los riesgos: el endpoint de confirmación vuelve a
 * leer y recalcular el Excel en el servidor. Aceptar los riesgos ya parseados
 * del cliente permitiría inyectar niveles de riesgo arbitrarios, que es
 * justo lo que la regla «los derivados se calculan siempre en el servidor»
 * existe para impedir.
 */
export class ImportarMatrizDto {
  /**
   * Área a la que pertenece la matriz. Si no se envía, se resuelve por el
   * nombre que trae la cabecera del Excel.
   */
  @ApiPropertyOptional({ example: '3320' })
  @IsOptional()
  @IsString()
  areaCodigo?: string;

  /** Año de la matriz. Si no se envía, se deduce de la cabecera. */
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  /**
   * Crear una versión nueva si ya existe una matriz para esa área y año.
   * Sin esto, el intento se rechaza con 409 en vez de duplicar en silencio.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nuevaVersion?: boolean;
}

export class ListarMatricesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaCodigo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  superintendencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anio?: number;

  @ApiPropertyOptional({ example: 'APROBADA' })
  @IsOptional()
  @IsString()
  estado?: string;
}

/** Resultado de persistir una importación. */
export class ResumenImportacionGuardada {
  @ApiProperty()
  matrizId: string;

  @ApiProperty({ example: 'MR-3320-2026-v1' })
  codigo: string;

  @ApiProperty()
  version: number;

  @ApiProperty()
  riesgosImportados: number;

  @ApiProperty()
  controlesImportados: number;

  @ApiProperty({ description: 'Riesgos SUSTANCIAL o INACEPTABLE' })
  requierenPgr: number;

  @ApiProperty({ type: [String] })
  advertencias: string[];
}
