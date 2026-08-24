import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Días que se conservan los asientos antes de que Mongo los borre solo. */
export const RETENCION_DIAS = 730; // 2 años

/**
 * Bitácora de todo lo que **modifica** el sistema: quién, qué y cuándo.
 *
 * Es de **solo anexado**. El servicio no expone actualización ni borrado, y la
 * única forma de que un asiento desaparezca es que venza su retención.
 *
 * A diferencia de `auditoria_firmas`, aquí los asientos **no se encadenan por
 * hash**. Encadenar obliga a leer el asiento anterior antes de escribir el
 * siguiente, lo que serializaría todas las escrituras del sistema; para unas
 * pocas firmas críticas compensa, para cada petición no. La garantía de que
 * nadie la altera se apoya en que no hay código que lo permita **y** en que el
 * usuario de Mongo de la aplicación no tenga permisos de update/delete sobre
 * esta colección — eso último es configuración del servidor, no código.
 */
@Schema({ timestamps: true, collection: 'auditoria' })
export class Auditoria extends Document {
  /** Username del JWT, o `anonimo` cuando la petición no lo trae. */
  @Prop({ required: true, index: true })
  usuario: string;

  /** Roles que tenía en ese momento; los de ahora pueden ser otros. */
  @Prop({ type: [String], default: [] })
  roles: string[];

  @Prop({ required: true, index: true })
  metodo: string;

  /** Ruta real de la petición, sin la query. */
  @Prop({ required: true })
  ruta: string;

  /**
   * Nombre legible de lo que se tocó (`linternas`, `prestamos`…). Sale del
   * primer segmento de la ruta salvo que el endpoint lo declare con `@Auditar`.
   */
  @Prop({ required: true, index: true })
  recurso: string;

  /** Documento afectado, si se pudo determinar. */
  @Prop({ index: true })
  documentoId?: string;

  @Prop({ required: true })
  estado: number;

  /** `true` si la petición terminó en error. */
  @Prop({ required: true, default: false, index: true })
  fallo: boolean;

  @Prop()
  mensajeError?: string;

  /** Cuerpo de la petición ya saneado: sin secretos y sin imágenes enteras. */
  @Prop({ type: Object })
  datos?: Record<string, unknown>;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  /** Milisegundos que tardó en responder. */
  @Prop()
  duracionMs?: number;

  @Prop({ required: true })
  fecha: Date;
}

export const AuditoriaSchema = SchemaFactory.createForClass(Auditoria);

// Consulta habitual de la pantalla: lo último primero, filtrando por usuario o
// recurso.
AuditoriaSchema.index({ fecha: -1 });
AuditoriaSchema.index({ usuario: 1, fecha: -1 });
AuditoriaSchema.index({ recurso: 1, fecha: -1 });

// Retención: Mongo borra los asientos vencidos sin que nadie tenga que acordarse.
AuditoriaSchema.index(
  { fecha: 1 },
  { expireAfterSeconds: RETENCION_DIAS * 24 * 60 * 60, name: 'retencion' },
);
