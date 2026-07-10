import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateClasificacionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
