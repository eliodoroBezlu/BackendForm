import { IsString, IsEnum, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ActividadEstado } from '../schemas/pgr.schema';

export class AprobarActividadItemDto {
  @IsString()
  _id: string;

  @IsEnum(ActividadEstado)
  estadoAprobacion: ActividadEstado;

  @IsOptional()
  @IsString()
  motivoRechazo?: string;
}

export class AprobarPgrDto {
  @IsString()
  aprobadoPor: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AprobarActividadItemDto)
  actividadesAprobacion: AprobarActividadItemDto[];
}
