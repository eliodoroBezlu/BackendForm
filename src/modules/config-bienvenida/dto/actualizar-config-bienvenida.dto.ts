import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  ValidateIf,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CATALOGO_ANIMACIONES,
  DURACION_MAXIMA_TOPE,
  DURACION_MINIMA_TOPE,
} from '../constantes';

/** Longitud máxima de los textos. Es una pantalla de paso, no un tablón. */
const LARGO_MENSAJE = 120;
const LARGO_SUBMENSAJE = 200;

export class BienvenidaDeAreaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  area: string;

  @IsString()
  @IsOptional()
  @MaxLength(LARGO_MENSAJE)
  mensaje?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LARGO_SUBMENSAJE)
  submensaje?: string;

  @IsIn(CATALOGO_ANIMACIONES)
  @IsOptional()
  animacion?: string;
}

export class MantenimientoDto {
  @IsBoolean()
  activo: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(LARGO_SUBMENSAJE)
  mensaje?: string;
}

export class ActualizarConfigBienvenidaDto {
  @IsBoolean()
  @IsOptional()
  activa?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(LARGO_MENSAJE)
  mensaje?: string;

  @IsString()
  @IsOptional()
  @MaxLength(LARGO_SUBMENSAJE)
  submensaje?: string;

  /**
   * Solo claves del catálogo. Es la validación que sostiene la decisión de no
   * aceptar animaciones arbitrarias: aquí se cierra la puerta.
   */
  @IsIn(CATALOGO_ANIMACIONES)
  @IsOptional()
  animacion?: string;

  /**
   * Restringido a Cloudinary **a propósito**: es el único host de imágenes que
   * permite la CSP del frontend, así que aceptar otro sería guardar una URL
   * que el navegador va a bloquear.
   *
   * `ValidateIf` y no solo `IsOptional`: éste último ignora `null` y
   * `undefined`, pero **no la cadena vacía**, y el formulario manda `""`
   * cuando se borra el campo. Sin esto, quitar el logotipo devolvía
   * «logoUrl must be a URL address» y el guardado entero fallaba.
   *
   * La cadena vacía significa «sin logotipo» y es una intención legítima que
   * tiene que poder expresarse.
   */
  @ValidateIf((o: { logoUrl?: string }) => o.logoUrl !== '')
  @IsUrl({ host_whitelist: ['res.cloudinary.com'] })
  @IsOptional()
  logoUrl?: string;

  @IsInt()
  @Min(0)
  @Max(DURACION_MINIMA_TOPE)
  @IsOptional()
  duracionMinimaMs?: number;

  @IsInt()
  @Min(1000)
  @Max(DURACION_MAXIMA_TOPE)
  @IsOptional()
  duracionMaximaMs?: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(LARGO_SUBMENSAJE, { each: true })
  @IsOptional()
  consejos?: string[];

  @IsDateString()
  @IsOptional()
  vigenteDesde?: string;

  @IsDateString()
  @IsOptional()
  vigenteHasta?: string;

  @ValidateNested()
  @Type(() => MantenimientoDto)
  @IsOptional()
  mantenimiento?: MantenimientoDto;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BienvenidaDeAreaDto)
  @IsOptional()
  porArea?: BienvenidaDeAreaDto[];
}
