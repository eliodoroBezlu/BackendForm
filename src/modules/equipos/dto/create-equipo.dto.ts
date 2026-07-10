import { IsString, IsNotEmpty, IsNumber, IsOptional, IsMongoId, IsObject } from 'class-validator';

export class CreateEquipoDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsOptional()
  codigo_antiguo?: string;

  @IsString()
  @IsOptional()
  codigo_parte?: string;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  modelo?: string;

  @IsNumber()
  @IsOptional()
  cantidad?: number;

  @IsNumber()
  @IsOptional()
  costo?: number;

  @IsString()
  @IsOptional()
  num_serie?: string;

  @IsString()
  @IsOptional()
  frecuencia_uso?: string;

  @IsString()
  @IsOptional()
  estado?: string;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsString()
  @IsNotEmpty()
  tipo_equipo: string;

  @IsMongoId()
  @IsNotEmpty()
  area_id: string;

  @IsMongoId()
  @IsNotEmpty()
  ubicacion_id: string;

  @IsMongoId()
  @IsNotEmpty()
  clasificacion_id: string;

  @IsObject()
  @IsOptional()
  especificaciones?: Record<string, any>;
}
