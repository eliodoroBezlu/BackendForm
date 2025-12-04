import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsMongoId } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsMongoId()
  @IsNotEmpty()
  superintendencia: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}