import { IsString, IsNotEmpty, IsArray, ValidateNested, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CampoFormularioDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];
}

export class CreateConfigFormularioDto {
  @IsString()
  @IsNotEmpty()
  tipo_equipo: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampoFormularioDto)
  campos: CampoFormularioDto[];
}
