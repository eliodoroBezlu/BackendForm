import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Firma, FirmaSchema } from '../../../common/firma/firma.schema';

export enum TipoEntrega {
  /** Primera y única entrega de la vida laboral del trabajador. */
  DOTACION = 'dotacion',
  /** Sustitución contra la devolución de la averiada. */
  CAMBIO = 'cambio',
  /** Sustitución sin devolución. Requiere justificación y aprobación. */
  REPOSICION_PERDIDA = 'reposicion_perdida',
}

export enum EstadoEntrega {
  /** Dotación y cambio nacen aquí: no pasan por aprobación. */
  REGISTRADA = 'registrada',
  PENDIENTE_APROBACION = 'pendiente_aprobacion',
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
  /**
   * Se registró y no debía registrarse.
   *
   * El asiento se queda —la información no se borra— pero sale de los
   * recuentos de dotación: para el sistema esa persona no recibió nada.
   */
  ANULADA = 'anulada',
}

/** Estados en los que la entrega ya no cuenta como dotación vigente. */
export const ESTADOS_SIN_EFECTO = [
  EstadoEntrega.RECHAZADA,
  EstadoEntrega.ANULADA,
];

@Schema({ _id: false })
export class ArchivoAdjunto {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  mime?: string;

  @Prop()
  tamano?: number;
}
export const ArchivoAdjuntoSchema =
  SchemaFactory.createForClass(ArchivoAdjunto);

/**
 * Devolución de la linterna averiada, obligatoria en un cambio.
 *
 * Sin `estadoFisico`: en un cambio la devuelta está averiada por definición
 * —esa es la razón del cambio—, así que un enum no aportaría nada y solo
 * invitaría a rellenarlo mal. Lo que lleva información es la foto.
 */
@Schema({ _id: false })
export class Devolucion {
  @Prop({ type: ArchivoAdjuntoSchema, required: true })
  foto: ArchivoAdjunto;

  @Prop()
  observacion?: string;
}
export const DevolucionSchema = SchemaFactory.createForClass(Devolucion);

/** Justificación y aprobación de una reposición por pérdida. */
@Schema({ _id: false })
export class Perdida {
  /** Lo redacta el trabajador: qué pasó y por qué. */
  @Prop({ required: true })
  justificacion: string;

  @Prop({ type: [ArchivoAdjuntoSchema], default: [] })
  evidencias: ArchivoAdjunto[];

  @Prop()
  aprobadoPor?: string;

  @Prop()
  fechaAprobacion?: Date;

  /**
   * En este bloque **solo firma quien aprueba**. El acuse de recibo de la
   * linterna nueva es otro acto y lleva la firma del trabajador, aparte.
   */
  @Prop({ type: FirmaSchema })
  firmaAprobador?: Firma;

  @Prop()
  comentarioAprobador?: string;
}
export const PerdidaSchema = SchemaFactory.createForClass(Perdida);

/**
 * Un cambio de tipo sobre una entrega ya registrada.
 *
 * No es una edición de campo: el tipo decide qué exige la entrega, si descuenta
 * stock y en qué estado nace. Por eso se guarda de qué a qué, quién y por qué —
 * sin el rastro, el stock cuadra de una forma que nadie sabe explicar.
 */
@Schema({ _id: false })
export class Reclasificacion {
  @Prop({ required: true })
  tipoAnterior: string;

  @Prop({ required: true })
  tipoNuevo: string;

  @Prop({ required: true })
  reclasificadaPor: string;

  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  motivo: string;
}

export const ReclasificacionSchema =
  SchemaFactory.createForClass(Reclasificacion);

/**
 * Un acto de entrega de linterna. **Un documento por entrega**, no un estado
 * por persona.
 *
 * Si el trabajador tiene linterna, cuántas perdió o cuándo fue la última
 * entrega **se deriva** de estos eventos. Guardar ese estado aparte obliga a
 * mantenerlo en sincronía, y es de donde salen los números que no cuadran.
 */
@Schema({ timestamps: true, collection: 'entregas_linterna' })
export class EntregaLinterna extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Trabajador',
    required: true,
    index: true,
  })
  trabajador: Types.ObjectId;

  /**
   * Área y superintendencia **al momento de la entrega**, copiadas a propósito.
   * La gente cambia de área; si el reporte las resolviera por referencia, un
   * traslado reescribiría la historia y el acta firmada dejaría de coincidir
   * con la pantalla.
   */
  @Prop({ required: true, index: true })
  area: string;

  @Prop({ required: true, index: true })
  superintendencia: string;

  /** Nómina del trabajador, para leer el registro sin resolver la referencia. */
  @Prop({ required: true })
  nombreTrabajador: string;

  @Prop({ type: String, enum: TipoEntrega, required: true, index: true })
  tipo: TipoEntrega;

  @Prop({
    type: String,
    enum: EstadoEntrega,
    required: true,
    default: EstadoEntrega.REGISTRADA,
    index: true,
  })
  estado: EstadoEntrega;

  /** Se llena cuando la linterna sale de verdad: en una pérdida, tras aprobar. */
  @Prop()
  fechaEntrega?: Date;

  /**
   * La entrega es anterior al sistema: **no movió el stock que llevamos**.
   *
   * Son las dotaciones que el personal ya tenía cuando se puso en marcha el
   * módulo, cargadas de una vez y sin fecha porque nadie sabe de qué día es
   * cada una. Sin esta marca, el resumen las contaría como salidas del
   * almacén y quedaría diciendo «50 ingresadas, 188 entregadas, 50
   * disponibles», que no se sostiene.
   */
  @Prop({ default: false, index: true })
  previaAlSistema: boolean;

  @Prop({ required: true })
  registradoPor: string;

  @Prop()
  entregadoPor?: string;

  /** Acuse de recibo. Va en los tres tipos, pérdida incluida. */
  @Prop({ type: FirmaSchema })
  firmaTrabajador?: Firma;

  /** Por qué se anuló. Sin motivo, dentro de un ano nadie sabra por que. */
  @Prop()
  motivoAnulacion?: string;

  @Prop()
  anuladaPor?: string;

  @Prop()
  fechaAnulacion?: Date;

  /**
   * Tipos por los que ha pasado la entrega, si se reclasifico.
   *
   * Guarda de que a que, quien y por que. El tipo anterior no se pisa:
   * cambiar un cambio por una perdida mueve stock y estado, y sin el
   * rastro no hay forma de explicar despues por que cuadraron asi.
   */
  @Prop({ type: [ReclasificacionSchema], default: [] })
  reclasificaciones: Reclasificacion[];

  @Prop({ type: DevolucionSchema })
  devolucion?: Devolucion;

  @Prop({ type: PerdidaSchema })
  perdida?: Perdida;

  @Prop()
  observacion?: string;
}

export type EntregaLinternaDocument = EntregaLinterna & Document;
export const EntregaLinternaSchema =
  SchemaFactory.createForClass(EntregaLinterna);

/**
 * **Una sola dotación por trabajador**, garantizada por la base.
 *
 * El índice es parcial: solo alcanza a los documentos de tipo `dotacion`, así
 * que los cambios y las reposiciones pueden repetirse sin límite.
 *
 * Vive aquí y no solo en el servicio porque dos operadores a la vez —o un doble
 * clic— ganan la carrera a cualquier comprobación de «¿ya tiene?» hecha en
 * código.
 */
EntregaLinternaSchema.index(
  { trabajador: 1 },
  {
    unique: true,
    partialFilterExpression: { tipo: TipoEntrega.DOTACION },
    name: 'una_dotacion_por_trabajador',
  },
);
