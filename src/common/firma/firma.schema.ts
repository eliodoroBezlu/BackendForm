import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Cómo se capturó la firma. */
export enum MetodoFirma {
  /** Trazada en el momento sobre el lienzo. */
  DIBUJADA = 'dibujada',
  /** Foto o escaneo de una firma ya existente. */
  SUBIDA = 'subida',
}

/**
 * Una firma **sellada**: la imagen más lo que hace falta para poder demostrar
 * después que nadie la tocó.
 *
 * ── Por qué un hash y no una marca en la imagen ───────────────────────────
 *
 * La idea intuitiva —alterar levemente la imagen al subirla para hacerla única—
 * no demuestra integridad: demuestra, como mucho, que ese archivo pasó por
 * nosotros. Y tiene dos defectos graves: **modifica la evidencia**, que es justo
 * lo que hay que preservar intacto, y cualquier marca en píxeles se elimina
 * reencodeando.
 *
 * El hash resuelve lo que se buscaba sin tocar nada: recalcularlo sobre la
 * imagen guardada y compararlo con `hash` detecta cualquier cambio posterior,
 * hasta de un píxel.
 *
 * ── Hasta dónde llega ─────────────────────────────────────────────────────
 *
 *   ✅ La imagen no cambió desde que se guardó.
 *   ✅ Cuándo se guardó y desde qué sesión.
 *   ✅ Si el mismo archivo se reutilizó en otro registro (`hash` está indexado).
 *   ❌ **No** prueba que esa persona la trazó.
 *
 * Para lo último haría falta una credencial por persona (certificado digital)
 * emitida por el IAM. Esto no es una firma digital y no debe presentarse como
 * tal: es el mismo nivel de prueba que el papel, con la ventaja de detectar
 * manipulación posterior.
 */
@Schema({ _id: false })
export class Firma {
  /** La evidencia, intacta. Data URL igual que las dibujadas. */
  @Prop({ required: true })
  imagen: string;

  /**
   * SHA-256 en hexadecimal de los **bytes decodificados** de la imagen, no del
   * data URL: así el hash no cambia si algún día se reescribe la cabecera
   * `data:image/...` sin tocar el contenido.
   *
   * Indexado a propósito — es lo que permite detectar que la misma firma se
   * reutilizó en dos registros.
   */
  @Prop({ required: true, index: true })
  hash: string;

  @Prop({ required: true, enum: MetodoFirma })
  metodo: MetodoFirma;

  /** Usuario de la sesión que la envió. */
  @Prop({ required: true })
  firmadoPor: string;

  /** Hora del **servidor**. La del navegador la controla quien firma. */
  @Prop({ required: true })
  firmadoEn: Date;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;
}

export const FirmaSchema = SchemaFactory.createForClass(Firma);
