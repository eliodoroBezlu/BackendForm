import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateResponseOptionDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsString()
  label: string;

  @IsDefined()
  value: string | number | boolean;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateResponseConfigDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateResponseOptionDto)
  options?: CreateResponseOptionDto[];

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  min?: number;

  @IsOptional()
  max?: number;
}

export class CreateQuestionImageDto {
  @IsString()
  url: string;

  @IsString() // ← Obligatorio ahora
  caption: string;
}

export class CreateQuestionDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsString()
  text: string;

  @IsBoolean()
  obligatorio: boolean;

  @ValidateNested()
  @Type(() => CreateResponseConfigDto)
  responseConfig: CreateResponseConfigDto;

  @IsOptional()
  order?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateQuestionImageDto)
  image?: CreateQuestionImageDto;
}

export class CreateSectionImageDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsString()
  url: string;

  @IsString() // ← Obligatorio ahora
  caption: string;

  @IsOptional()
  order?: number;
}

// ← IMPORTANTE: Esta clase se auto-referencia
export class CreateSectionDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionImageDto)
  images?: CreateSectionImageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];

  @IsOptional()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isParent?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  // ← RECURSIÓN: Subsecciones del mismo tipo
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  subsections?: CreateSectionDto[];
}

export class CreateVerificationFieldDto {
  @IsString()
  label: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsArray()
  options?: string[];

  /** Con `type: select`, admite un valor fuera de la lista. */
  @IsOptional()
  @IsBoolean()
  permiteOtro?: boolean;

  @IsOptional()
  @IsString()
  dataSource?: string;

  /**
   * Valor con el que aparece el campo la primera vez.
   *
   * El caso que lo motivó es `EMPRESA`: sale en escaleras, man-lift y vehículo
   * y siempre lleva lo mismo, así que pedírselo al inspector en cada parte es
   * trabajo sin información. Se escribe desde el constructor y no en el
   * código, porque es un dato de negocio: el día que cambie la razón social se
   * toca en el panel.
   *
   * Solo se aplica si el campo está vacío, y queda editable.
   */
  @IsOptional()
  @IsString()
  valorPorDefecto?: string;

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;
}

export class CreateFrecuenciaInspeccionDto {
  @IsEnum([
    'diaria',
    'semanal',
    'mensual',
    'trimestral',
    'semestral',
    'anual',
    'personalizada',
  ])
  unidad: string;

  @IsOptional()
  @IsNumber()
  valorPersonalizado?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class CreateTemplateHerraEquipoDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsString()
  revision: string;

  @IsEnum(['interna', 'externa'])
  type: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  /** Roles que ven esta plantilla. Vacío = visible para todos. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rolesVisibles?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVerificationFieldDto)
  verificationFields: CreateVerificationFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[];

  @IsOptional()
  @IsString()
  campoCodigoEquipo?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateFrecuenciaInspeccionDto)
  frecuencia?: CreateFrecuenciaInspeccionDto;
}
