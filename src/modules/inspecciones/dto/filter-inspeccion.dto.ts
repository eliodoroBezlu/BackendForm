import { IsOptional, IsString, IsDateString, IsEnum } from "class-validator"

export class FilterInspeccionesDto {
  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  superintendencia?: string

  @IsOptional()
  @IsEnum(["SI", "NO"])
  operativo?: "SI" | "NO"

  @IsOptional()
  @IsString()
  numInspeccion?: string
}

