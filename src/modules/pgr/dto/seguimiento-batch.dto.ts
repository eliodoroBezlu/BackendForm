import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SeguimientoPgrDto } from './seguimiento-pgr.dto';

export class SeguimientoBatchItemDto extends SeguimientoPgrDto {
  @IsString()
  actividadId: string;
}

export class SeguimientoBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeguimientoBatchItemDto)
  seguimientos: SeguimientoBatchItemDto[];
}
