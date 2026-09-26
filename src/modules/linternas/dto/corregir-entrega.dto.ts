import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RegistrarEntregaDto } from './registrar-entrega.dto';

/**
 * Anula una entrega que no debía registrarse.
 *
 * El asiento se queda —la información no se borra— pero sale de los recuentos
 * de dotación.
 */
export class AnularEntregaDto {
  /** Sin motivo, dentro de un año nadie sabrá por qué se anuló. */
  @IsString()
  @IsNotEmpty()
  motivo: string;

  /**
   * Si la linterna volvió físicamente al almacén.
   *
   * Lo declara quien anula porque **el sistema no puede saberlo**, y suponerlo
   * descuadraría el inventario en silencio: si se repone siempre, un registro
   * anulado de una linterna que sí salió deja una unidad de más que no está.
   */
  @IsBoolean()
  @IsOptional()
  linternaRecuperada?: boolean;
}

/**
 * Cambia el tipo de una entrega ya registrada.
 *
 * Lleva **la entrega entera**, no solo el tipo: cada tipo exige unos bloques y
 * prohíbe otros —un cambio pide la foto de la linterna averiada, una pérdida
 * pide la justificación escrita—, así que reclasificar es volver a declarar la
 * entrega con las reglas del tipo nuevo, no tocar un campo.
 */
export class ReclasificarEntregaDto extends RegistrarEntregaDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}

/**
 * Corrige lo que no cambia la naturaleza del acto.
 *
 * El tipo, el trabajador y los bloques **no** entran aquí: cambiar esos mueve
 * stock y estado, y eso va por `reclasificar`. Esto es para el error de
 * tecleo en la observación.
 */
export class CorregirEntregaDto {
  @IsString()
  @IsOptional()
  observacion?: string;
}
