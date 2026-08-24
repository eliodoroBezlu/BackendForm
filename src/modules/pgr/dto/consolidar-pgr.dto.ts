import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * La superintendencia y la gestión **no viajan aquí**: salen del PGR destino,
 * que se identifica por id en la ruta. Aceptarlas por body permitiría pedir la
 * consolidación de una superintendencia distinta de la del PGR que se escribe.
 */
export class ConsolidarPgrDto {
  /**
   * Mantener una actividad por área en vez de unificar.
   *
   * El PGR real usa las dos formas: hay verificadores unificados y otros
   * desdoblados con prefijo `AREA <NOMBRE>` cuando conviene programar y medir
   * cada área por separado.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  desdoblarPorArea?: boolean;
}
