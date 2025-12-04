import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// create-superintendencia.dto.ts
export class CreateSuperintendenciaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
