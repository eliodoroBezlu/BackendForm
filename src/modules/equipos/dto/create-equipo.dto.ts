import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsMongoId,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AmbitoEquipo } from '../schemas/equipo.schema';

export class FotoEquipoDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  mime?: string;

  @IsNumber()
  @IsOptional()
  tamano?: number;
}

export class CreateEquipoDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  /** Placa del vehículo — dato distinto del número interno de flota. */
  @IsString()
  @IsOptional()
  placa?: string;

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

  /** Identificador físico (RFID EPC). Único cuando está presente. */
  @IsString()
  @IsOptional()
  rfid?: string;

  /**
   * Nivel al que pertenece el equipo. Decide qué referencia hace falta:
   * `area` → `area_id`, `superintendencia` → `superintendencia_id`,
   * `gerencia` → `gerencia_id`. Lo valida el servicio, que es quien puede
   * comprobar que la referencia exista.
   */
  @IsEnum(AmbitoEquipo)
  @IsOptional()
  ambito?: AmbitoEquipo;

  @IsMongoId()
  @IsOptional()
  area_id?: string;

  @IsMongoId()
  @IsOptional()
  superintendencia_id?: string;

  @IsMongoId()
  @IsOptional()
  gerencia_id?: string;

  /** Sector o TAG del equipo de planta donde está montado. */
  @IsString()
  @IsOptional()
  subarea?: string;

  @IsString()
  @IsOptional()
  responsable?: string;

  @IsMongoId()
  @IsNotEmpty()
  ubicacion_id: string;

  @IsMongoId()
  @IsNotEmpty()
  clasificacion_id: string;

  @IsObject()
  @IsOptional()
  especificaciones?: Record<string, any>;

  /**
   * Fotos ya subidas, en el orden elegido: la primera es la portada.
   *
   * Va con `@ValidateNested` **y** `@Type` porque el `ValidationPipe` global usa
   * `whitelist: true` y sin la anotación de tipo descarta en silencio todo el
   * contenido de cada objeto.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FotoEquipoDto)
  fotos?: FotoEquipoDto[];
}
