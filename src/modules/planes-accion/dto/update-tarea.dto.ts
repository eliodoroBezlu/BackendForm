import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { AddTareaDto, EvidenciaDto } from './add-tarea.dto';
import { Type } from 'class-transformer';

export class UpdateTareaDto extends PartialType(AddTareaDto) {
  @ApiProperty({ enum: ['abierto', 'en-progreso', 'cerrado'], required: false })
  @IsOptional()
  @IsEnum(['abierto', 'en-progreso', 'cerrado'])
  estado?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  aprobado?: boolean;

  @ApiProperty({ 
    required: false, 
    type: [EvidenciaDto],
    description: 'Archivos adjuntos como evidencia'
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias?: EvidenciaDto[];
}