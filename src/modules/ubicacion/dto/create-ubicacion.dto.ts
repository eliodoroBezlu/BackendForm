import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  Matches,
} from 'class-validator';

export class CreateUbicacionDto {
  /**
   * Sin `>`: es el separador de rutas del Excel de importación, y un nombre
   * que lo contenga no podría escribirse como ruta.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^>]*$/, {
    message: "El nombre no puede contener '>' (se usa para separar niveles)",
  })
  nombre: string;

  /** Ubicación de la que cuelga. Ausente o `null` = raíz. */
  @IsOptional()
  @IsMongoId()
  padre?: string | null;
}
