import { IsString, IsArray, ValidateNested, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PgrEstado } from '../schemas/pgr.schema';

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

  @IsString()
  frecuencia: string;

  @IsArray()
  @IsString({ each: true })
  mesesProgramados: string[];
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
