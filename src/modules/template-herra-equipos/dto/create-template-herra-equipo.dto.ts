import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDefined, IsEnum, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateResponseOptionDto {
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
  @IsString()
  url: string;

  @IsString() // ← Obligatorio ahora
  caption: string;

  @IsOptional()
  order?: number;
}

// ← IMPORTANTE: Esta clase se auto-referencia
export class CreateSectionDto {
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

  @IsOptional()
  @IsString()
  dataSource?: string;
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVerificationFieldDto)
  verificationFields: CreateVerificationFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[];
}