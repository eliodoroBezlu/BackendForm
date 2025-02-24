import { IsNotEmpty, IsString, IsDate, IsArray, ValidateNested, IsEnum } from "class-validator"
import { Type } from "class-transformer"

class InformacionGeneralDto {
  @IsNotEmpty()
  @IsString()
  superintendencia: string

  @IsNotEmpty()
  @IsString()
  trabajador: string

  @IsNotEmpty()
  @IsString()
  supervisor: string

  @IsNotEmpty()
  @IsString()
  area: string

  @IsNotEmpty()
  @IsString()
  numInspeccion: string

  @IsNotEmpty()
  @IsString()
  codConector: string

  @IsNotEmpty()
  @IsString()
  codArnes: string

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  fecha: Date
}

class InspectionItemDto {
  @IsNotEmpty()
  @IsString()
  id: string

  @IsNotEmpty()
  @IsString()
  description: string

  @IsEnum(["si", "no", "na", null])
  response: "si" | "no" | "na" | null

  @IsString()
  observation: string
}

class InspectionSectionDto {
  @IsNotEmpty()
  @IsString()
  id: string

  @IsNotEmpty()
  @IsString()
  category: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items: InspectionItemDto[]
}

class InspectionTitleDto {
  @IsNotEmpty()
  @IsString()
  id: string

  @IsNotEmpty()
  @IsString()
  title: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionSectionDto)
  items: InspectionSectionDto[]
}

export class CreateInspeccionDto {
  @IsNotEmpty()
  @IsString()
  documentCode: string

  @IsNotEmpty()
  @Type(() => Number)
  revisionNumber: number

  @ValidateNested()
  @Type(() => InformacionGeneralDto)
  informacionGeneral: InformacionGeneralDto

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionTitleDto)
  resultados: InspectionTitleDto[]

  @IsEnum(["SI", "NO", null])
  operativo: "SI" | "NO" | null

  @IsString()
  observacionesComplementarias: string

  @IsNotEmpty()
  @IsString()
  inspectionConductedBy: string

  @IsString()
  firmaInspector: string

  @IsNotEmpty()
  @IsString()
  inspectionApprovedBy: string

  @IsString()
  firmaSupervisor: string

  @IsDate()
  @Type(() => Date)
  reviewDate: Date
}
