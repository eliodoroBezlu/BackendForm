import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoCatalogoMonitoreo } from '../domain/catalogos-iniciales';

export class CrearCatalogoMonitoreoDto {
  @IsEnum(TipoCatalogoMonitoreo)
  tipo: TipoCatalogoMonitoreo;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  valor: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  codigo?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'El color va como #RRGGBB' })
  color?: string;
}

export class ActualizarCatalogoMonitoreoDto extends PartialType(
  OmitType(CrearCatalogoMonitoreoDto, ['tipo'] as const),
) {
  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}
