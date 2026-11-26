import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AplicarSincronizacionDto {
  @ApiPropertyOptional({
    description:
      'Ids de fichas del IAM a aplicar (de nuevos, con cambios y bajas). Sin el campo se aplica todo.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({
    description:
      'Actualizar también quién es supervisor en forms. Por defecto sí.',
  })
  @IsOptional()
  @IsBoolean()
  supervisores?: boolean;
}
