import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PgrEstado } from '../schemas/pgr.schema';

export class ProgramacionMesDto {
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @IsInt()
  @Min(0)
  programado: number;

  /** Ejecutado con retraso — no cuenta para eficiencia. */
  @IsOptional()
  @IsInt()
  @Min(0)
  realMesPasado?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  realDelMes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  realMesAdelantado?: number;
}

export class CreateActividadDto {
  @IsString()
  descripcion: string;

  @IsString()
  responsable: string;

  @IsString()
  verificador: string;

  @IsString()
  recurso: string;

  @IsString()
  entregable: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramacionMesDto)
  programacion?: ProgramacionMesDto[];

  @IsOptional()
  @IsString()
  historialTrazabilidad?: string;

  /** Evidencias; al importar se rellena con los hipervínculos de las celdas. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidencias?: string[];

  /** @deprecated Se deriva de `programacion[]`. */
  @IsOptional()
  @IsString()
  frecuencia?: string;

  /** @deprecated Se deriva de `programacion[]`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mesesProgramados?: string[];
}

export class CreatePgrDto {
  @IsString()
  empresa: string;

  @IsString()
  vicepresidencia: string;

  @IsString()
  gerencia: string;

  @IsString()
  superintendencia: string;

  @IsString()
  gestion: string;

  @IsOptional()
  @IsString()
  supervisor?: string;

  @IsOptional()
  @IsString()
  responsable?: string;

  @IsOptional()
  @IsString()
  codigoExterno?: string;

  /** Mes de corte del periodo (`$J$4` en el Excel). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesCorte?: number;

  /** Ventana de la gestión completa en meses (`$W$4`). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  ventanaGestion?: number;

  @IsOptional()
  @IsEnum(PgrEstado)
  estado?: PgrEstado;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActividadDto)
  actividades?: CreateActividadDto[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
