import { IsString, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateTrabajadorDto {
  @IsString()
  @IsNotEmpty()
  ci: string;

  @IsString()
  @IsNotEmpty()
  nomina: string;

  @IsString()
  @IsNotEmpty()
  puesto: string;

  @IsDateString()
  @IsNotEmpty()
  fecha_ingreso: Date;

  @IsString()
  @IsNotEmpty()
  superintendencia: string;
}