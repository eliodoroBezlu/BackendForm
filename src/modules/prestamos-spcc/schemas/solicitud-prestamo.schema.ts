import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';
import { Firma, FirmaSchema } from '../../../common/firma/firma.schema';

export enum EstadoSolicitud {
  /** Pedida por el supervisor; los equipos siguen en el almacén. */
  SOLICITADA = 'solicitada',
  /** El admin los entregó; están fuera. */
  ENTREGADA = 'entregada',
  /** No queda ninguna línea fuera. Se llega aquí solo, al devolver la última. */
  CERRADA = 'cerrada',
  /** Anulada antes de entregar. */
  CANCELADA = 'cancelada',
}

/** Quién entregó los equipos y con qué firmas. */
@Schema({ _id: false })
export class Entrega {
  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  entregadoPor: string;

  /** Firma de quien saca los equipos del almacén. */
  @Prop({ type: FirmaSchema })
  firmaEntrega?: Firma;

  /** Firma de quien se los lleva. */
  @Prop({ type: FirmaSchema })
  firmaReceptor?: Firma;

  @Prop()
  observacion?: string;
}

export const EntregaSchema = SchemaFactory.createForClass(Entrega);

/**
 * Lo que se pide: **un tipo y cuántos**, no equipos concretos.
 *
 * Quien solicita sabe que necesita «dos arneses y un anclaje»; no tiene por
 * qué saber qué códigos hay en el almacén ni cuáles están libres el día que
 * los recoja. Los equipos concretos los elige el almacén al entregar, que es
 * el único momento en que se sabe de verdad cuáles salen.
 */
@Schema({ _id: false })
export class LineaSolicitada {
  /** Uno de `TIPOS_PRESTABLES`. */
  @Prop({ required: true })
  tipoEquipo: string;

  @Prop({ required: true, min: 1 })
  cantidad: number;
}

export const LineaSolicitadaSchema =
  SchemaFactory.createForClass(LineaSolicitada);

/**
 * Una corrección hecha sobre una solicitud ya registrada.
 *
 * Guarda **lo que decía antes**, porque es lo único que permite entender una
 * copia impresa que ya no coincide con el sistema.
 */
@Schema({ _id: false })
export class Correccion {
  /** Qué se corrigió. Hoy solo `solicitante`. */
  @Prop({ required: true })
  campo: string;

  @Prop()
  valorAnterior?: string;

  @Prop()
  valorNuevo?: string;

  @Prop({ required: true })
  corregidoPor: string;

  @Prop({ required: true })
  fecha: Date;

  /** Por qué se corrigió. Sin motivo, dentro de un año nadie sabrá por qué. */
  @Prop({ required: true })
  motivo: string;
}

export const CorreccionSchema = SchemaFactory.createForClass(Correccion);

/**
 * Cabecera de un préstamo: quién pide, para qué área y con qué plazo.
 *
 * Los equipos **no** viven aquí sino en `prestamos_spcc`, una línea por
 * equipo. Ver el comentario del índice en ese archivo: con los equipos
 * embebidos, el índice que impide prestar dos veces lo mismo seguiría
 * bloqueando un equipo ya devuelto.
 */
@Schema({ timestamps: true, collection: 'solicitudes_prestamo' })
export class SolicitudPrestamo extends Document {
  /** Correlativo legible, para citarlo en papel: `PR-2026-0001`. */
  @Prop({ required: true, unique: true, index: true })
  numero: string;

  /**
   * Área que pide. Se guardan **nombre e id**: el nombre congela cómo se
   * llamaba al pedirlo, que es lo que dice el acta, y el id permite agrupar
   * aunque luego la renombren.
   */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Area', index: true })
  areaSolicitanteId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  areaSolicitante: string;

  @Prop()
  superintendenciaSolicitante?: string;

  /**
   * Quién pide los equipos.
   *
   * No tiene por qué ser quien teclea la solicitud: lo normal es que alguien
   * la pida de palabra en el mostrador y la registre el de almacén. Hasta
   * ahora este campo se rellenaba con el usuario de la sesión y no había forma
   * de decir otra cosa, así que las solicitudes quedaban a nombre de quien las
   * escribía. Ver `registradoPor`.
   */
  @Prop({ required: true, index: true })
  solicitanteUsername: string;

  @Prop()
  solicitanteNombre?: string;

  /**
   * Quién tecleó la solicitud, que puede no ser quien la pidió.
   *
   * Se guarda siempre. Sin esto, dejar elegir al solicitante habría hecho
   * imposible saber quién registró el movimiento.
   */
  @Prop({ index: true })
  registradoPor?: string;

  /**
   * Correcciones hechas sobre una solicitud ya registrada.
   *
   * El acta imprime el nombre del solicitante, y el sello de las firmas es un
   * hash **sobre la imagen**, no sobre el contenido: cambiar el nombre no
   * rompe ningún hash, así que el acta pasaría a decir algo distinto de lo que
   * se firmó sin que nada lo detectase. Guardando aquí lo que decía antes, el
   * acta puede mostrarlo y quien tenga una copia impresa vieja entiende por
   * qué no coincide.
   *
   * El valor anterior no se pisa nunca: la información no se borra.
   */
  @Prop({ type: [CorreccionSchema], default: [] })
  correcciones: Correccion[];

  /** Para qué se piden. Obligatorio: un préstamo sin motivo no se justifica. */
  @Prop({ required: true })
  motivo: string;

  /**
   * Qué y cuánto se pidió, por tipo.
   *
   * Opcional en el esquema —y no en la práctica— por las solicitudes creadas
   * antes de este cambio: aquéllas nacieron con los equipos ya elegidos y no
   * tienen cantidades que declarar. Ver `LineaSolicitada`.
   */
  @Prop({ type: [LineaSolicitadaSchema], default: [] })
  solicitado: LineaSolicitada[];

  @Prop({ required: true })
  fechaSolicitud: Date;

  /**
   * Desde cuándo se necesitan los equipos.
   *
   * Un préstamo tiene dos extremos, no uno: sin el inicio no se sabe si un
   * equipo está comprometido para la semana que viene o si simplemente nadie
   * lo ha pedido. Opcional por las solicitudes anteriores a este campo.
   */
  @Prop({ index: true })
  fechaInicioPrevista?: Date;

  /** Cuándo se compromete a devolverlos. Sin esto no hay atrasos que reclamar. */
  @Prop({ required: true, index: true })
  fechaDevolucionPrevista: Date;

  @Prop({
    required: true,
    enum: EstadoSolicitud,
    default: EstadoSolicitud.SOLICITADA,
    index: true,
  })
  estado: EstadoSolicitud;

  @Prop({ type: EntregaSchema })
  entrega?: Entrega;

  @Prop()
  fechaCierre?: Date;

  @Prop()
  canceladaPor?: string;

  @Prop()
  motivoCancelacion?: string;
}

export const SolicitudPrestamoSchema =
  SchemaFactory.createForClass(SolicitudPrestamo);

SolicitudPrestamoSchema.index({ estado: 1, fechaDevolucionPrevista: 1 });
SolicitudPrestamoSchema.index({ createdAt: -1 });
