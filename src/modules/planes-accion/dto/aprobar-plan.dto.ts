import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AprobarPlanDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
