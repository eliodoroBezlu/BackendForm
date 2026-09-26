import { ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

/**
 * IDs de los equipos a exportar — el frontend manda exactamente lo que el
 * usuario está viendo tras aplicar sus filtros (área, ubicación, búsqueda),
 * en vez de que el backend intente reconstruir esos mismos filtros.
 */
export class ExportarEquiposDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  ids: string[];
}
