import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MetodoFirma } from './firma.schema';

export enum AccionFirma {
  FIRMADA = 'firmada',
  /** Se reemplazó una firma que ya existía. */
  REFIRMADA = 'refirmada',
}

/**
 * Bitácora de firmas, **solo de anexado**.
 *
 * Cada asiento guarda el hash del anterior (`hashAnterior`), así que alterar un
 * asiento viejo rompe la cadena de todos los siguientes. Sin ese encadenado, un
 * registro de auditoría se puede editar en silencio y no prueba nada.
 *
 * Nadie debe actualizar ni borrar documentos de esta colección; el servicio solo
 * expone inserción y lectura.
 */
@Schema({ timestamps: true, collection: 'auditoria_firmas' })
export class AuditoriaFirma extends Document {
  /** Qué documento y qué campo se firmó. */
  @Prop({ required: true, index: true })
  coleccion: string;

  @Prop({ required: true, index: true })
  documentoId: string;

  /** Ruta del campo dentro del documento, p. ej. `firmaTrabajador`. */
  @Prop({ required: true })
  campo: string;

  /** Hash de la imagen firmada — el mismo que queda en el documento. */
  @Prop({ required: true, index: true })
  hashFirma: string;

  @Prop({ required: true, enum: MetodoFirma })
  metodo: MetodoFirma;

  @Prop({ required: true, enum: AccionFirma })
  accion: AccionFirma;

  @Prop({ required: true })
  firmadoPor: string;

  @Prop({ required: true })
  firmadoEn: Date;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  /** Hash del asiento anterior de la bitácora. Vacío en el primero. */
  @Prop({ default: '' })
  hashAnterior: string;

  /** Hash de este asiento. Es lo que encadena al siguiente. */
  @Prop({ required: true, index: true })
  hashAsiento: string;
}

export const AuditoriaFirmaSchema =
  SchemaFactory.createForClass(AuditoriaFirma);
