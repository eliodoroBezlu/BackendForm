import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvidenciaDto } from './add-tarea.dto';

/**
 * Corrección del admin sobre una tarea: cualquier dato (también los del
 * hallazgo, que vienen de la inspección) y el estado, también hacia atrás. El
 * motivo es obligatorio y queda en el historial.
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

  // Los datos del hallazgo también: el admin corrige lo que la IRO cargó mal.
  // Son obligatorios en la tarea: se pueden cambiar, no vaciar.
  @ApiProperty({ required: false, description: 'ISO' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La fecha del hallazgo no puede quedar vacía' })
  fechaHallazgo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({
    message: 'El responsable de la observación no puede quedar vacío',
  })
  responsableObservacion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La empresa no puede quedar vacía' })
  empresa?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El lugar físico no puede quedar vacío' })
  lugarFisico?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La actividad no puede quedar vacía' })
  actividad?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La descripción no puede quedar vacía' })
  descripcionObservacion?: string;

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

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Usernames de todos los responsables de cierre',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsablesAreaCierreUsernames?: string[];

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
