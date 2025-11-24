import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerarPlanesDto {
  @ApiProperty({ 
    required: false, 
    default: false,
    description: 'Incluir observaciones con puntaje 3 que tengan comentario' 
  })
  @IsOptional()
  @IsBoolean()
  incluirPuntaje3?: boolean;

  @ApiProperty({ 
    required: false, 
    default: true,
    description: 'Solo generar planes si la observación tiene comentario' 
  })
  @IsOptional()
  @IsBoolean()
  incluirSoloConComentario?: boolean;
}

