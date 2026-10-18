import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import {
  AntecedentesReporte,
  EstadoReporte,
  TareaDeReporte,
} from '../domain/reporte';

@Schema({ _id: false })
export class LecturasReporte {
  /** Horas desde la última intervención, del contador de PI. */
  @Prop({ type: Number })
  horas?: number;

  /** Cuándo se leyeron las horas, si no es el día del reporte. */
  @Prop({ type: Date })
  fecha_horas?: Date;

  @Prop({ type: Number })
  temp_referencia_c?: number;

  /** Dónde se tomó la temperatura de referencia (catálogo). */
  @Prop({ type: String })
  punto_referencia?: string;

  /** Catálogo de instrumentos. */
  @Prop({ type: String })
  instrumento?: string;

  /** Emisividad configurada en la cámara (FLIR: 0,95). */
  @Prop({ type: Number })
  emisividad?: number;
}

@Schema({ _id: false })
export class ImagenReporte {
  /** Nombre del archivo en la carpeta privada del módulo, no una ruta. */
  @Prop({ type: String, required: true })
  archivo: string;

  @Prop({ type: String, default: '' })
  descripcion: string;

  /**
   * Medidas en píxeles tras reducirla. La vista previa y el PDF las usan
   * para la caja común de las fotos (`proporcionDeCaja`).
   */
  @Prop({ type: Number })
  ancho?: number;

  @Prop({ type: Number })
  alto?: number;

  /** La foto de referencia (la brida ciega de COTEM009). */
  @Prop({ type: Boolean, default: false })
  referencia: boolean;
}

@Schema({ _id: false })
export class MovimientoReporte {
  @Prop({ type: String, required: true })
  accion: 'creado' | 'enviado' | 'devuelto' | 'emitido';

  @Prop({ type: String, required: true })
  por: string;

  @Prop({ type: Date, required: true })
  en: Date;

  @Prop({ type: String })
  motivo?: string;
}

/**
 * Un reporte de monitoreo de equipos (formato 2.03.P01.R09).
 *
 * Borrador → pendiente de revisión → emitido. El **código interno** se asigna
 * al emitir y no antes: numerar al crear dejaría huecos con cada borrador
 * abandonado, y el correlativo es lo que el área usa para ubicar sus
 * informes.
 */
@Schema({ timestamps: true, collection: 'reportes_monitoreo' })
export class ReporteMonitoreo extends Document {
  @Prop({ type: String, required: true })
  tipo_equipo: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
    index: true,
  })
  equipo_id: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  tag: string;

  @Prop({ type: Date, required: true, index: true })
  fecha: Date;

  @Prop({ type: String })
  tecnica?: string;

  @Prop({ type: String })
  ot?: string;

  @Prop({ type: String })
  alcance?: string;

  @Prop({ type: LecturasReporte, default: {} })
  lecturas: LecturasReporte;

  @Prop({ type: String })
  descripcion_proceso?: string;

  @Prop({ type: [ImagenReporte], default: [] })
  fotos: ImagenReporte[];

  /** El gráfico de PI, de ancho completo. */
  @Prop({ type: ImagenReporte })
  grafico?: ImagenReporte;

  /** Copiado de la plantilla al crear: cambiarla no redistribuye reportes viejos. */
  @Prop({ type: Number, required: true })
  fotos_por_fila: number;

  @Prop({ type: String })
  analisis?: string;

  @Prop({ type: [String], default: [] })
  recomendaciones: string[];

  @Prop({ type: String })
  tecnica_apoyo?: string;

  /** Severidad del catálogo. La ACCIÓN de la cabecera es este mismo valor. */
  @Prop({ type: String, index: true })
  resultado?: string;

  @Prop({ type: [Object], default: [] })
  tareas: TareaDeReporte[];

  /**
   * Copia del momento. Se rehace en cada guardado del borrador y se congela al
   * enviar a revisión: el revisor aprueba lo que ve.
   */
  @Prop({ type: Object, required: true })
  antecedentes: AntecedentesReporte;

  @Prop({
    type: String,
    enum: EstadoReporte,
    default: EstadoReporte.BORRADOR,
    index: true,
  })
  estado: EstadoReporte;

  /** Usuario (username) que lo elaboró. */
  @Prop({ type: String, required: true, index: true })
  elaboradoPor: string;

  @Prop({ type: String })
  revisadoPor?: string;

  @Prop({ type: Date })
  emitidoEn?: Date;

  @Prop({ type: String })
  codigo_interno?: string;

  @Prop({ type: Number })
  correlativo?: number;

  @Prop({ type: [MovimientoReporte], default: [] })
  historial: MovimientoReporte[];

  activo?: boolean;
}

export const ReporteMonitoreoSchema =
  SchemaFactory.createForClass(ReporteMonitoreo);
ReporteMonitoreoSchema.plugin(bajaLogica);

ReporteMonitoreoSchema.index(
  { codigo_interno: 1 },
  {
    unique: true,
    partialFilterExpression: { codigo_interno: { $type: 'string' } },
  },
);
/** «Informe anterior»: el último emitido del mismo TAG. */
ReporteMonitoreoSchema.index({ tag: 1, estado: 1, fecha: -1 });
