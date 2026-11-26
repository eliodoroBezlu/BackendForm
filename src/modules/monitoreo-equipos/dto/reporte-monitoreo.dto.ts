import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  IsUrl,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  EstadoReporte,
  FOTOS_POR_FILA_MAXIMO,
  MAX_ANEXOS,
  MAX_FOTOS,
  MAX_RECOMENDACIONES,
  MAX_TAREAS,
} from '../domain/reporte';
import { FORMA_ARCHIVO } from '../domain/archivos';
import { PIEZAS_BOMBA } from '../domain/bomba';

export class LecturasReporteDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  horas?: number;

  @IsOptional()
  @IsDateString()
  fecha_horas?: string;

  @IsOptional()
  @IsNumber()
  temp_referencia_c?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  punto_referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instrumento?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  emisividad?: number;

  /** Ultrasonido: velocidad del sonido en m/s (acero: 5920). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20000)
  velocidad_ms?: number;

  /** Ultrasonido: frecuencia del sensor en MHz. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  frecuencia_mhz?: number;
}

/**
 * Una pieza como la deja el analista en el reporte. Lo vacío toma el dato de
 * la ficha de la bomba; las horas vacías se calculan.
 */
export class PiezaReporteDto {
  @IsIn(PIEZAS_BOMBA)
  pieza: string;

  @IsOptional()
  @IsDateString()
  fecha_instalacion?: string;

  /** Lista de proveedores. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  proveedor?: string;

  /** Lista de condiciones iniciales. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  condicion_inicial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  material?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  horas_trabajo?: number;
}

export class ImagenReporteDto {
  @Matches(FORMA_ARCHIVO, {
    message: 'El archivo no es uno subido a este módulo',
  })
  archivo: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  referencia?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  ancho?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  alto?: number;
}

export class TareaReporteDto {
  @IsString()
  @MaxLength(300)
  descripcion: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grupo_trabajo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  prioridad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  comunicado_con?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  semana?: string;
}

/**
 * El contenido del reporte. Todo es opcional salvo el TAG y la fecha: un
 * borrador se guarda a medias, y lo que falta se exige al enviarlo.
 *
 * Los antecedentes, los cálculos, el estado y el código **no** se reciben:
 * los arma el servidor.
 */
export class CrearReporteMonitoreoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tag: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tecnica?: string;

  /** Solo números (`''` lo vacía). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^\d*$/, { message: 'El N° de OT lleva solo números' })
  ot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  alcance?: string;

  /** El enlace al informe anterior (`''` lo quita). */
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: 'El informe anterior tiene que ser un enlace (https://…)' },
  )
  @MaxLength(1000)
  informe_anterior_url?: string;

  /** ANTECEDENTES en texto libre (reportes con medición de espesores). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  antecedentes_texto?: string;

  /**
   * Los espesores medidos, `[pieza][zona][anillo][punto]` con `null` donde
   * no se midió. La forma se revisa contra la grilla del reporte
   * (`erroresDeValores`): aquí solo se exige que sea una lista.
   */
  @IsOptional()
  @IsArray()
  medicion_valores?: unknown[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIEZAS_BOMBA.length)
  @ValidateNested({ each: true })
  @Type(() => PiezaReporteDto)
  piezas?: PiezaReporteDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LecturasReporteDto)
  lecturas?: LecturasReporteDto;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descripcion_proceso?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FOTOS)
  @ValidateNested({ each: true })
  @Type(() => ImagenReporteDto)
  fotos?: ImagenReporteDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ImagenReporteDto)
  /** `null` quita el gráfico. */
  grafico?: ImagenReporteDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ANEXOS)
  @ValidateNested({ each: true })
  @Type(() => ImagenReporteDto)
  anexos?: ImagenReporteDto[];

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  analisis?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RECOMENDACIONES)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  recomendaciones?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tecnica_apoyo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resultado?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAREAS)
  @ValidateNested({ each: true })
  @Type(() => TareaReporteDto)
  tareas?: TareaReporteDto[];
}

/** El TAG no cambia: un reporte de otra bomba es otro reporte. */
export class ActualizarReporteMonitoreoDto extends PartialType(
  OmitType(CrearReporteMonitoreoDto, ['tag'] as const),
) {}

export class DevolverReporteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  motivo: string;
}

export class FiltrosReportesDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsEnum(EstadoReporte)
  estado?: EstadoReporte;

  @IsOptional()
  @IsString()
  tecnica?: string;

  @IsOptional()
  @IsString()
  resultado?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class FijarCorrelativoDto {
  @IsString()
  @Matches(/^[A-Z]{2,8}$/, {
    message: 'El código de técnica va en mayúsculas: COTEM',
  })
  tecnica_codigo: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  /** El último número ya usado (fuera del sistema, en el Excel). */
  @IsInt()
  @Min(0)
  ultimo: number;
}

export class PlantillaMonitoreoDto {
  @IsInt()
  @Min(1)
  @Max(FOTOS_POR_FILA_MAXIMO)
  fotos_por_fila: number;
}
