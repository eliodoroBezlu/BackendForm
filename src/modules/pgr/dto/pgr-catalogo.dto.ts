import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CriterioGrupo } from '../schemas/pgr-catalogo.schema';

export class CrearUnidadDto {
  @ApiProperty({ example: 'HH' })
  @IsString()
  @MinLength(1)
  codigo: string;

  @ApiProperty({ example: 'Horas hombre' })
  @IsString()
  @MinLength(1)
  nombre: string;
}

export class ActualizarUnidadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CrearEntregableDto {
  @ApiProperty({ example: 'Reporte mensual de inspecciones' })
  @IsString()
  @MinLength(1)
  nombre: string;
}

export class ActualizarEntregableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CrearGrupoDto {
  @ApiProperty({ example: 'Supervisores de Mantenimiento Chancado' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiPropertyOptional({ description: 'Ámbito. Vacío = sin restricción.' })
  @IsOptional()
  @IsString()
  superintendencia?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas?: string[];

  @ApiProperty({ enum: CriterioGrupo })
  @IsEnum(CriterioGrupo)
  criterio: CriterioGrupo;

  /** Con `criterio: regla`. */
  @ApiPropertyOptional({ type: [String], example: ['SUPERVISOR'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiPropertyOptional({ example: 'Supervisor' })
  @IsOptional()
  @IsString()
  puestoContiene?: string;

  /** Con `criterio: lista` — CIs. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  miembros?: string[];
}

export class ActualizarGrupoDto extends CrearGrupoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
