import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FORMA_ARCHIVO } from '../domain/archivos';
import {
  ESPESOR_MAXIMO_MM,
  MAX_ANILLOS,
  MAX_PIEZAS_MEDICION,
  MAX_PUNTOS,
  MAX_ZONAS_POR_PIEZA,
} from '../domain/espesores';

/** Diagramas por plantilla: el Excel trae dos (muestreador y válvula). */
export const MAX_DIAGRAMAS = 6;

export class ZonaMedicionDto {
  /** Vacío cuando la pieza tiene una sola zona. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nombre?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ANILLOS)
  anillos: number;

  @IsInt()
  @Min(1)
  @Max(MAX_PUNTOS)
  puntos: number;
}

export class PiezaMedicionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ZONAS_POR_PIEZA)
  @ValidateNested({ each: true })
  @Type(() => ZonaMedicionDto)
  zonas: ZonaMedicionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(ESPESOR_MAXIMO_MM)
  espesor_nominal_mm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(ESPESOR_MAXIMO_MM)
  espesor_alerta_mm?: number;
}

export class DiagramaMedicionDto {
  @Matches(FORMA_ARCHIVO, {
    message: 'El archivo no es uno subido a este módulo',
  })
  archivo: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descripcion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ancho?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  alto?: number;
}

export class PlantillaMedicionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tag: string;

  /** Una técnica de su lista. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tecnica: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titulo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PIEZAS_MEDICION)
  @ValidateNested({ each: true })
  @Type(() => PiezaMedicionDto)
  piezas: PiezaMedicionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DIAGRAMAS)
  @ValidateNested({ each: true })
  @Type(() => DiagramaMedicionDto)
  diagramas?: DiagramaMedicionDto[];
}
