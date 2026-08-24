import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoDevolucion } from '../schemas/prestamo-spcc.schema';

/** Un tipo de SPCC y cuántos se piden de él. */
export class LineaSolicitadaDto {
  @IsString()
  @IsNotEmpty()
  tipoEquipo: string;

  /**
   * El tope no es decorativo: sin él, un cero de más en el teclado convierte
   * un pedido de 3 arneses en uno de 300 y nadie lo nota hasta el almacén.
   */
  @IsInt()
  @Min(1)
  @Max(50)
  cantidad: number;
}

export class CrearSolicitudDto {
  @IsString()
  @IsNotEmpty()
  areaSolicitante: string;

  @IsMongoId()
  @IsOptional()
  areaSolicitanteId?: string;

  @IsString()
  @IsOptional()
  superintendenciaSolicitante?: string;

  @IsString()
  @IsNotEmpty()
  motivo: string;

  /**
   * Desde cuándo se necesitan. Opcional para no romper a los clientes que aún
   * mandan solo la fecha de devolución; si falta, el servicio toma hoy.
   */
  @IsDateString()
  @IsOptional()
  fechaInicioPrevista?: string;

  @IsDateString()
  @IsNotEmpty()
  fechaDevolucionPrevista: string;

  /**
   * Qué y cuánto se pide, por tipo.
   *
   * Sustituye a la lista de ids de equipo: quien solicita ya no elige códigos
   * concretos, eso pasa a la entrega. Ver `EntregarDto.equipos`.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LineaSolicitadaDto)
  solicitado: LineaSolicitadaDto[];
}

export class EntregarDto {
  /**
   * Los equipos que salen de verdad del almacén.
   *
   * Aquí es donde el préstamo deja de ser una intención y pasa a ser una
   * lista de códigos. Es opcional por las solicitudes anteriores a este
   * cambio, que ya nacieron con sus líneas creadas: en ésas el servicio se
   * limita a marcarlas como entregadas.
   */
  @IsArray()
  @IsOptional()
  @IsMongoId({ each: true })
  equipos?: string[];

  @IsString()
  @IsOptional()
  firmaEntrega?: string;

  @IsString()
  @IsOptional()
  firmaReceptor?: string;

  @IsString()
  @IsOptional()
  observacion?: string;
}

class FotoDevolucionDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  nombre?: string;
}

export class DevolverItemDto {
  @IsMongoId()
  @IsNotEmpty()
  prestamo: string;

  @IsEnum(EstadoDevolucion)
  estado: EstadoDevolucion;

  @ValidateNested()
  @Type(() => FotoDevolucionDto)
  @IsOptional()
  foto?: FotoDevolucionDto;

  @IsString()
  @IsOptional()
  observacion?: string;
}

/**
 * Devolución de una o varias líneas a la vez.
 *
 * En lote porque en la práctica el admin marca varios ítems de un mismo
 * préstamo en una sentada, y hacer una petición por cada uno multiplicaría los
 * estados intermedios sin ganar nada.
 */
export class DevolverDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DevolverItemDto)
  items: DevolverItemDto[];
}

export class CancelarDto {
  @IsString()
  @IsOptional()
  motivo?: string;
}
