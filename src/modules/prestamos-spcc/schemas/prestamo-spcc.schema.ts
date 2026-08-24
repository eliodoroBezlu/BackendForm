import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export enum EstadoPrestamo {
  SOLICITADO = 'solicitado',
  ENTREGADO = 'entregado',
  DEVUELTO = 'devuelto',
  CANCELADO = 'cancelado',
}

/** En qué estado vuelve el equipo. Decide si puede volver a prestarse. */
export enum EstadoDevolucion {
  OPERATIVO = 'operativo',
  REQUIERE_INSPECCION = 'requiere_inspeccion',
  BAJA = 'baja',
}

/** Estados en los que el equipo está fuera del almacén. */
export const ESTADOS_ACTIVOS = [
  EstadoPrestamo.SOLICITADO,
  EstadoPrestamo.ENTREGADO,
];

@Schema({ _id: false })
export class ArchivoDevolucion {
  @Prop({ required: true })
  url: string;

  @Prop()
  nombre?: string;
}

export const ArchivoDevolucionSchema =
  SchemaFactory.createForClass(ArchivoDevolucion);

@Schema({ _id: false })
export class Devolucion {
  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  registradoPor: string;

  @Prop({ required: true, enum: EstadoDevolucion })
  estado: EstadoDevolucion;

  /** Foto del daño, si lo hay. */
  @Prop({ type: ArchivoDevolucionSchema })
  foto?: ArchivoDevolucion;

  @Prop()
  observacion?: string;
}

export const DevolucionSchema = SchemaFactory.createForClass(Devolucion);

/**
 * Una línea de préstamo: **un equipo**.
 *
 * Es un documento propio y no un elemento dentro de la solicitud por una razón
 * concreta, no por gusto: la invariante del módulo es que un equipo no puede
 * estar en dos préstamos activos a la vez, y se defiende con el índice único
 * de abajo. Con los equipos embebidos en la solicitud, el filtro parcial solo
 * podría mirar el estado **de la solicitud**, así que un equipo ya devuelto
 * seguiría bloqueado mientras el préstamo siguiera abierto por los demás.
 */
@Schema({ timestamps: true, collection: 'prestamos_spcc' })
export class PrestamoSpcc extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SolicitudPrestamo',
    required: true,
    index: true,
  })
  solicitud: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
    index: true,
  })
  equipo: Types.ObjectId;

  /**
   * Datos del equipo congelados al prestarlo.
   *
   * El acta y el historial deben seguir diciendo lo mismo dentro de dos años,
   * aunque el inventario cambie la descripción o el equipo se dé de baja.
   */
  @Prop({ required: true })
  codigo: string;

  @Prop()
  rfid?: string;

  @Prop({ required: true })
  descripcion: string;

  @Prop({ required: true, index: true })
  tipoEquipo: string;

  /** Portada del equipo al momento del préstamo. */
  @Prop()
  foto?: string;

  @Prop({
    required: true,
    enum: EstadoPrestamo,
    default: EstadoPrestamo.SOLICITADO,
    index: true,
  })
  estado: EstadoPrestamo;

  @Prop({ type: DevolucionSchema })
  devolucion?: Devolucion;
}

export const PrestamoSpccSchema = SchemaFactory.createForClass(PrestamoSpcc);

/**
 * **La invariante del módulo, en la base de datos.**
 *
 * Un equipo no puede tener dos líneas activas. Dos supervisores pidiendo el
 * mismo arnés en el mismo instante chocan aquí, no en un `if` del servicio que
 * puede perder la carrera entre la lectura y la escritura.
 *
 * El filtro parcial mira el estado de **la línea**, así que devolverla la
 * libera al momento, sin esperar a que se cierre la solicitud entera.
 */
PrestamoSpccSchema.index(
  { equipo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      estado: { $in: ESTADOS_ACTIVOS },
    },
    name: 'un_prestamo_activo_por_equipo',
  },
);

PrestamoSpccSchema.index({ solicitud: 1, estado: 1 });
PrestamoSpccSchema.index({ createdAt: -1 });
