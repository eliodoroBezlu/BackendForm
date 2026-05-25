import { IsString, IsOptional, IsArray, IsDate } from 'class-validator';

export class SeguimientoPgrDto {
  @IsOptional()
  @IsDate()
  fechaEjecucion?: Date;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  semaforoTiempo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidencias?: string[];
}
