import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PgrEstado } from '../schemas/pgr.schema';

export class ProgramacionMesDto {
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @IsInt()
  @Min(0)
  programado: number;

  /** Ejecutado con retraso — no cuenta para eficiencia. */
  @IsOptional()
  @IsInt()
  @Min(0)
  realMesPasado?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  realDelMes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  realMesAdelantado?: number;
}

export class ResponsableActividadDto {
  @ApiProperty({ enum: ['grupo', 'trabajador'] })
  @IsIn(['grupo', 'trabajador'])
  tipo: 'grupo' | 'trabajador';

  /** `_id` del grupo, o `ci` del trabajador. */
  @ApiProperty()
  @IsString()
  referencia: string;

  @ApiProperty()
  @IsString()
  nombre: string;
}

export class RecursoActividadDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  cantidad: number;

  @ApiProperty({
    example: 'HH',
    description: 'Código del catálogo de unidades',
  })
  @IsString()
  unidad: string;
}

export class CreateActividadDto {
  /**
   * Id de la actividad, presente solo al **editar**.
   *
   * Es lo que permite que `PgrService.update` fusione en vez de reemplazar.
   * Sin declararlo acá el `ValidationPipe({ whitelist: true })` lo descartaba,
   * así que cada guardado del formulario de configuración regeneraba los
   * subdocumentos y se llevaba puestos `origenMatriz`, la aprobación y todo el
   * seguimiento de la actividad.
   */
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsString()
  descripcion: string;

  /**
   * Áreas de la superintendencia a las que aplica. **Vacío = todas.**
   * No viaja al Excel: es un dato interno para acotar, filtrar y editar.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResponsableActividadDto)
  responsables?: ResponsableActividadDto[];

  @IsString()
  verificador: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecursoActividadDto)
  recursos?: RecursoActividadDto[];

  /** Normalmente uno, pero se admiten varios. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entregables?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramacionMesDto)
  programacion?: ProgramacionMesDto[];

  @IsOptional()
  @IsString()
  historialTrazabilidad?: string;

  /** Evidencias; al importar se rellena con los hipervínculos de las celdas. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidencias?: string[];

  /** @deprecated Se deriva de `programacion[]`. */
  @IsOptional()
  @IsString()
  frecuencia?: string;

  /** @deprecated Se deriva de `programacion[]`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mesesProgramados?: string[];
}

export class CreatePgrDto {
  @IsString()
  empresa: string;

  @IsString()
  vicepresidencia: string;

  @IsString()
  gerencia: string;

  @IsString()
  superintendencia: string;

  @IsString()
  gestion: string;

  // `supervisor` y `responsable` se retiraron de la cabecera: no pertenecen al
  // PGR —la responsabilidad se declara por actividad— y en los 17 planes
  // cargados ninguno los tenía.

  @IsOptional()
  @IsString()
  codigoExterno?: string;

  /** Mes de corte del periodo (`$J$4` en el Excel). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesCorte?: number;

  /** Ventana de la gestión completa en meses (`$W$4`). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  ventanaGestion?: number;

  @IsOptional()
  @IsEnum(PgrEstado)
  estado?: PgrEstado;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActividadDto)
  actividades?: CreateActividadDto[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
