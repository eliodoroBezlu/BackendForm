import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class EvidenciaDto {
  @ApiProperty({ description: 'Nombre del archivo' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ description: 'URL del archivo' })
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class MLMetadataDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  fue_recomendacion_ml?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  indice_recomendacion?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  recomendaciones_originales?: string[];
}

export class AddTareaDto {
  @ApiProperty()
  @IsString()
  fechaHallazgo: string;

  @ApiProperty()
  @IsString()
  responsableObservacion: string;

  @ApiProperty()
  @IsString()
  empresa: string;

  @ApiProperty()
  @IsString()
  lugarFisico: string;

  @ApiProperty()
  @IsString()
  actividad: string;

  @ApiProperty()
  @IsString()
  familiaPeligro: string;

  @ApiProperty()
  @IsString()
  descripcionObservacion: string;

  @ApiProperty()
  @IsString()
  accionPropuesta: string;

  @ApiProperty()
  @IsString()
  responsableAreaCierre: string;

  @ApiProperty()
  @IsString()
  fechaCumplimientoAcordada: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fechaCumplimientoEfectiva?: string;

  @ApiProperty({ 
    required: false, 
    type: [EvidenciaDto],
    description: 'Archivos adjuntos como evidencia'
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias?: EvidenciaDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => MLMetadataDto)
  mlMetadata?: MLMetadataDto;
}