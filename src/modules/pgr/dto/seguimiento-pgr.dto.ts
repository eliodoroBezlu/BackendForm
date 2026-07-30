import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProgramacionMesDto } from './create-pgr.dto';

export class SeguimientoPgrDto {
  @IsOptional()
  @Type(() => Date)
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

  /**
   * Programación con las cantidades ejecutadas por categoría de oportunidad.
   * Es lo que alimenta el cálculo de eficacia y eficiencia.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramacionMesDto)
  programacion?: ProgramacionMesDto[];
}
