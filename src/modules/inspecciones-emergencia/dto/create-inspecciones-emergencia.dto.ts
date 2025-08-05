import {
  IsString,
  IsEnum,
  IsNumber,
  IsDate,
  IsObject,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

enum EstadoInspeccion {
  CONFORME = '✓',
  NO_CONFORME = 'X',
  NO_APLICA = 'N/A',
}

enum Periodo {
  ENERO_JUNIO = 'ENERO-JUNIO',
  JULIO_DICIEMBRE = 'JULIO-DICIEMBRE',
}

enum Mes {
  ENERO = 'ENERO',
  FEBRERO = 'FEBRERO',
  MARZO = 'MARZO',
  ABRIL = 'ABRIL',
  MAYO = 'MAYO',
  JUNIO = 'JUNIO',
  JULIO = 'JULIO',
  AGOSTO = 'AGOSTO',
  SEPTIEMBRE = 'SEPTIEMBRE',
  OCTUBRE = 'OCTUBRE',
  NOVIEMBRE = 'NOVIEMBRE',
  DICIEMBRE = 'DICIEMBRE',
}

enum EstadoFormulario {
  ACTIVO = 'activo',
  COMPLETADO = 'completado',
  ARCHIVADO = 'archivado',
}

class SistemaInspeccionDto {
  @IsNumber()
  cantidad: number;

  @IsEnum(EstadoInspeccion)
  estado: EstadoInspeccion;

  @IsString()
  @IsOptional()
  observaciones?: string;
}

class SistemasPasivosDto {
  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  puertasEmergencia: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  senaleticaViasEvacuacion: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  planosEvacuacion: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  registroPersonalEvacuacion: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  numerosEmergencia: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  luzEmergencia: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  puntoReunion: SistemaInspeccionDto;
}

class SistemasActivosDto {
  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  kitDerrame: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  lavaOjos: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  duchasEmergencia: SistemaInspeccionDto;

  @ValidateNested()
  @Type(() => SistemaInspeccionDto)
  desfibriladorAutomatico: SistemaInspeccionDto;
}

class InspeccionSistemasMensualDto {
  @ValidateNested()
  @Type(() => SistemasPasivosDto)
  sistemasPasivos: SistemasPasivosDto;

  @ValidateNested()
  @Type(() => SistemasActivosDto)
  sistemasActivos: SistemasActivosDto;

  @IsString()
  @IsOptional()
  observaciones?: string;
}

class InspeccionExtintorDto {
  @IsString()
  fechaInspeccion: string;

  @IsString()
  codigo: string;

  @IsString()
  ubicacion: string;

  @IsEnum(EstadoInspeccion)
  inspeccionMensual: EstadoInspeccion;

  @IsEnum(EstadoInspeccion)
  manguera: EstadoInspeccion;

  @IsEnum(EstadoInspeccion)
  cilindro: EstadoInspeccion;

  @IsEnum(EstadoInspeccion)
  indicadorPresion: EstadoInspeccion;

  @IsEnum(EstadoInspeccion)
  gatilloChavetaPrecinto: EstadoInspeccion;

  @IsEnum(EstadoInspeccion)
  senalizacionSoporte: EstadoInspeccion;

  @IsString()
  observaciones: string;
}

class InspectorDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  firma: string | null;
}

class InspeccionMensualDto {
  @ValidateNested()
  @Type(() => InspeccionSistemasMensualDto)
  inspeccionesActivos: InspeccionSistemasMensualDto;

  @ValidateNested({ each: true })
  @Type(() => InspeccionExtintorDto)
  inspeccionesExtintor: InspeccionExtintorDto[];

  @ValidateNested()
  @Type(() => InspectorDto)
  inspector: InspectorDto;
}

export class CreateFormularioInspeccionDto {
  @IsString()
  @IsOptional()
  documentCode?: string;

  @IsNumber()
  @IsOptional()
  revisionNumber?: number;

  @IsString()
  superintendencia: string;

  @IsString()
  area: string;

  @IsString()
  @IsOptional()
  tag?: string;

  @IsString()
  @IsOptional()
  responsableEdificio?: string;

  @IsString()
  edificio: string;

  @IsEnum(Periodo)
  periodo: Periodo;

  @IsNumber()
  año: number;

  @IsEnum(Mes)
  mesActual: Mes;

  @IsObject()
  meses: Record<string, any>

  // @IsObject()
  // @ValidateNested({ each: true })
  // @Type(() => InspeccionMensualDto)
  // meses: { [key in Mes]?: InspeccionMensualDto };

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaCreacion?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaUltimaModificacion?: Date;

  @IsEnum(EstadoFormulario)
  @IsOptional()
  estado?: EstadoFormulario;
}
