import { IsOptional, IsDateString, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TrainModelDto {
  @ApiProperty({ required: false, description: 'ID del template para filtrar' })
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiProperty({ required: false, description: 'Fecha desde' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ required: false, description: 'Fecha hasta' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  
}