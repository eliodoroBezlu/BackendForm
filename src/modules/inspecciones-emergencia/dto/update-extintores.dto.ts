import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { InspeccionExtintor } from '../schemas/inspeccion-emergencia.schema';

export class ExtintorDto implements Partial<InspeccionExtintor> {
  @IsString()
  codigo: string;

  // Añade aquí las demás propiedades de InspeccionExtintor según necesites
}

export class ExtintoresUpdateDto {
  @IsString()
  tag: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtintorDto)
  extintores: ExtintorDto[];
}