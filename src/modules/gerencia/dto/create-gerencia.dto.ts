import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGerenciaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
