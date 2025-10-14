// create-extintor.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateExtintorDto {
  @IsString()
  @IsNotEmpty()
  area: string;

  @IsString()
  @IsNotEmpty()
  tag: string;

  @IsString()
  @IsNotEmpty()
  CodigoExtintor: string;

  @IsString()
  @IsNotEmpty()
  Ubicacion: string;

  @IsOptional()
  @IsBoolean()
  inspeccionado?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}