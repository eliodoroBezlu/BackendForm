import { IsOptional, IsString, IsMongoId, IsNumber, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInspectionScheduleDto {
  @ApiProperty({ description: 'Template ID' })
  @IsMongoId()
  templateId: string;

  @ApiProperty({ description: 'Template name' })
  @IsString()
  templateName: string;

  @ApiProperty({ description: 'Area' })
  @IsString()
  area: string;

  @ApiProperty({ description: 'Management year', example: 2025 })
  @IsNumber()
  @Min(2020)
  managementYear: number;

  @ApiProperty({ description: 'First semester due date', required: false })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : null)
  firstSemesterDueDate?: Date;

  @ApiProperty({ description: 'Second semester due date', required: false })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : null)
  secondSemesterDueDate?: Date;

  @ValidateIf(o => !o.firstSemesterDueDate && !o.secondSemesterDueDate)
  @IsString()
  @IsOptional()
  atLeastOneDate?: string;
}