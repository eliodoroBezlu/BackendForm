import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTareaDto {
   @ApiProperty()
  @IsString()
  fechaHallazgo: string;

  @ApiProperty()
  @IsString()
  responsableObservacion: string;

  @ApiProperty()
  @IsString()
  empresa: string;

  @ApiProperty()
  @IsString()
  lugarFisico: string;

  @ApiProperty()
  @IsString()
  actividad: string;

  @ApiProperty()
  @IsString()
  familiaPeligro: string;

  @ApiProperty()
  @IsString()
  descripcionObservacion: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  accionPropuesta: string;

  @ApiProperty()
  @IsString()
  responsableAreaCierre: string;

  @ApiProperty()
  @IsString()
  fechaCumplimientoAcordada: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fechaCumplimientoEfectiva?: string;
}

export class CreatePlanAccionDto {
  @ApiProperty()
  @IsString()
  vicepresidencia: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  superintendenciaSenior?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  superintendencia?: string;

  @ApiProperty()
  @IsString()
  areaFisica: string;

  @ApiProperty({ type: [CreateTareaDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTareaDto)
  tareas?: CreateTareaDto[];
}
