import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvidenciaDto } from './add-tarea.dto';

/**
 * Corrección del admin sobre una tarea: los datos de seguimiento y el estado
 * (también hacia atrás). Los datos del hallazgo no están: vienen de la
 * inspección. El motivo es obligatorio y queda en el historial.
 *
 * Las fechas aceptan `''` para borrarlas (por ejemplo, la efectiva al volver
 * una tarea cerrada a «en progreso»).
 */
export class CorregirTareaDto {
  @ApiProperty({ description: 'Por qué se corrige (queda en el historial)' })
  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  motivo: string;

  @ApiProperty({ enum: ['abierto', 'en-progreso', 'cerrado'], required: false })
  @IsOptional()
  @IsEnum(['abierto', 'en-progreso', 'cerrado'])
  estado?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  familiaPeligro?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accionPropuesta?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  responsableAreaCierre?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  responsableAreaCierreUsername?: string;

  @ApiProperty({ required: false, description: 'ISO, o vacío para borrarla' })
  @IsOptional()
  @IsString()
  fechaCumplimientoAcordada?: string;

  @ApiProperty({ required: false, description: 'ISO, o vacío para borrarla' })
  @IsOptional()
  @IsString()
  fechaCumplimientoEfectiva?: string;

  @ApiProperty({ required: false, type: [EvidenciaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias?: EvidenciaDto[];
}
