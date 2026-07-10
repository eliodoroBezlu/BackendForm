import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateUbicacionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
