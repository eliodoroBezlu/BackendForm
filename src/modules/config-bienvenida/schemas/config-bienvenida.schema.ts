import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Clave del documento único. La colección guarda **una sola fila**: no hay
 * varias bienvenidas entre las que elegir, hay una configuración del sistema.
 * El índice único sobre esta clave es lo que impide que se dupliquen.
 */
export const CLAVE_BIENVENIDA = 'bienvenida';

/**
 * Mensaje y animación propios de un área.
 *
 * El área —y no el rol— es lo que pidió el usuario: en planta la gente se
 * identifica por dónde trabaja, y un aviso de «parada de molienda» le importa
 * a Molienda y a nadie más.
 *
 * Lo que no se declare aquí cae al valor general; así un área puede cambiar
 * solo el mensaje y quedarse con la animación de todos.
 */
@Schema({ _id: false })
export class BienvenidaDeArea {
  /** Nombre del área tal y como lo guarda `Trabajador.area`. */
  @Prop({ required: true })
  area: string;

  @Prop()
  mensaje?: string;

  @Prop()
  submensaje?: string;

  /** Clave del catálogo de animaciones. Ver `CATALOGO_ANIMACIONES`. */
  @Prop()
  animacion?: string;
}
export const BienvenidaDeAreaSchema =
  SchemaFactory.createForClass(BienvenidaDeArea);

/**
 * Aviso de mantenimiento.
 *
 * Es lo que convierte esta pantalla en herramienta de operación y no solo en
 * decoración: permite avisar de una parada sin desplegar nada.
 */
@Schema({ _id: false })
export class Mantenimiento {
  @Prop({ default: false })
  activo: boolean;

  @Prop()
  mensaje?: string;
}
export const MantenimientoSchema = SchemaFactory.createForClass(Mantenimiento);

/**
 * Configuración de la pantalla que se ve al entrar al sistema.
 *
 * **Es información decorativa y pública.** Se lee sin token porque hace falta
 * antes de validar la sesión: pedir credenciales para saber qué texto pintar
 * mientras se comprueban las credenciales no tiene salida.
 *
 * Nada de lo que hay aquí es sensible; si algún día lo fuera, el sitio deja de
 * ser este.
 */
@Schema({ timestamps: true, collection: 'config_bienvenida' })
export class ConfigBienvenida extends Document {
  @Prop({ required: true, unique: true, index: true, default: CLAVE_BIENVENIDA })
  clave: string;

  /** Apagarla sin perder lo configurado. Con `false` se entra sin pantalla. */
  @Prop({ default: true })
  activa: boolean;

  @Prop({ required: true })
  mensaje: string;

  @Prop()
  submensaje?: string;

  @Prop({ required: true })
  animacion: string;

  /** Logotipo opcional. Solo Cloudinary: es lo que permite la CSP del frontend. */
  @Prop()
  logoUrl?: string;

  /**
   * Tiempo mínimo en pantalla.
   *
   * Sin esto, una sesión que valida en 80 ms hace aparecer y desaparecer la
   * animación en un destello, que se lee como un fallo gráfico y no como una
   * bienvenida.
   */
  @Prop({ default: 600 })
  duracionMinimaMs: number;

  /**
   * Tope de seguridad. Pasado este tiempo se continúa igual: nadie debe
   * quedarse mirando una animación eterna porque una petición se colgó.
   */
  @Prop({ default: 8000 })
  duracionMaximaMs: number;

  /**
   * Consejos de seguridad que rotan al azar.
   *
   * Ese segundo de espera es el único momento del día en que todo el personal
   * mira la misma pantalla; desaprovecharlo en una aplicación de seguridad
   * sería raro.
   */
  @Prop({ type: [String], default: [] })
  consejos: string[];

  /**
   * Vigencia del mensaje. Fuera de rango se usa el mensaje por defecto del
   * código: un aviso que no caduca solo se queda meses y la gente deja de
   * leer la pantalla entera.
   */
  @Prop()
  vigenteDesde?: Date;

  @Prop()
  vigenteHasta?: Date;

  @Prop({ type: MantenimientoSchema, default: () => ({ activo: false }) })
  mantenimiento: Mantenimiento;

  @Prop({ type: [BienvenidaDeAreaSchema], default: [] })
  porArea: BienvenidaDeArea[];

  @Prop()
  actualizadoPor?: string;
}

export type ConfigBienvenidaDocument = ConfigBienvenida & Document;
export const ConfigBienvenidaSchema =
  SchemaFactory.createForClass(ConfigBienvenida);
