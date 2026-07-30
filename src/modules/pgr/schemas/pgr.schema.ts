import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PgrEstado {
  BORRADOR = 'BORRADOR',
  EN_REVISION = 'EN_REVISION',
  APROBADO = 'APROBADO',
  CORREGIR = 'CORREGIR',
}

export enum ActividadEstado {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

export type PgrDocument = Pgr & Document;

/** Meses tal como los nombra el formulario 1.02.P06.F29 y el frontend. */
export const MESES_PGR = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/**
 * Programación y ejecución de una actividad en un mes concreto.
 *
 * Refleja la estructura real del PGR en Excel: la fila `Prog.` es una celda
 * combinada (un solo número por mes) y la fila `Real` son tres celdas sueltas
 * que reparten lo ejecutado según *cuándo* se hizo. El color de cada una en la
 * planilla original define la semántica:
 *
 *   - rojo   (`FFD99594`) → ejecutado con retraso  → NO cuenta para eficiencia
 *   - blanco (sin relleno) → ejecutado a tiempo
 *   - verde  (`FFEAF1DD`) → ejecutado adelantado
 */
@Schema({ _id: false })
export class ProgramacionMes {
  @Prop({ required: true, min: 1, max: 12 })
  mes: number;

  /** Cantidad programada para el mes (celda combinada de la fila `Prog.`). */
  @Prop({ required: true, default: 0, min: 0 })
  programado: number;

  /** Ejecutado con retraso — sub-columna roja. */
  @Prop({ default: 0, min: 0 })
  realMesPasado: number;

  /** Ejecutado dentro del mes — sub-columna blanca. */
  @Prop({ default: 0, min: 0 })
  realDelMes: number;

  /** Ejecutado adelantado — sub-columna verde. */
  @Prop({ default: 0, min: 0 })
  realMesAdelantado: number;
}

export const ProgramacionMesSchema =
  SchemaFactory.createForClass(ProgramacionMes);

@Schema()
export class Actividad {
  @Prop({ required: true })
  descripcion: string;

  @Prop({ required: true })
  responsable: string;

  @Prop({ required: true })
  verificador: string;

  @Prop({ required: true })
  recurso: string;

  @Prop({ required: true })
  entregable: string;

  /**
   * Programación mensual con cantidades. Es la fuente de verdad para calcular
   * eficacia y eficiencia (ver `domain/pgr-kpi.util.ts`).
   */
  @Prop({ type: [ProgramacionMesSchema], default: [] })
  programacion: ProgramacionMes[];

  /** Columna `Historial / Trazabilidad` del formulario. */
  @Prop({ required: false })
  historialTrazabilidad?: string;

  /**
   * @deprecated Sustituidos por `programacion[]`, del que se derivan.
   * Se mantienen opcionales para no romper los PGR ya cargados; se retirarán
   * en un PR aparte cuando el frontend escriba `programacion[]`.
   */
  @Prop({ required: false })
  frecuencia?: string;

  /** @deprecated Ver `frecuencia`. Se deriva de `programacion[]`. */
  @Prop({ required: false, type: [String], default: undefined })
  mesesProgramados?: string[];

  // Campos para Aprobación
  @Prop({
    type: String,
    enum: ActividadEstado,
    default: ActividadEstado.PENDIENTE,
  })
  estadoAprobacion: ActividadEstado;

  @Prop({ required: false })
  motivoRechazo?: string;

  // Seguimiento
  @Prop({ required: false })
  fechaEjecucion?: Date;

  @Prop({ required: false })
  observaciones?: string;

  @Prop({ required: false, type: [String] })
  evidencias?: string[];

  @Prop({ required: false })
  semaforoTiempo?: string; // e.g. "En el Mes", "Atrasado"
}

@Schema({ timestamps: true })
export class Pgr {
  @Prop({ required: true, unique: true })
  codigoAutogenerado: string;

  // Configuración Inicial
  @Prop({ required: true })
  empresa: string;

  @Prop({ required: true })
  vicepresidencia: string;

  @Prop({ required: true })
  gerencia: string;

  @Prop({ required: true })
  superintendencia: string;

  @Prop({ required: true })
  gestion: string;

  /** Supervisor de la cabecera del formulario (distinto del de cada actividad). */
  @Prop({ required: false })
  supervisor?: string;

  /** Responsable de la cabecera del formulario. */
  @Prop({ required: false })
  responsable?: string;

  /**
   * Código corporativo del documento origen (`V04-G02-S01-...`), distinto del
   * `codigoAutogenerado` interno. Sirve de clave natural para detectar
   * reimportaciones del mismo Excel.
   */
  @Prop({ required: false, index: true })
  codigoExterno?: string;

  /**
   * Mes de corte del periodo (1-12). Equivale a la celda de control `$J$4`
   * del Excel: define hasta qué mes acumulan los KPIs de "Periodo".
   */
  @Prop({ required: true, default: 12, min: 1, max: 12 })
  mesCorte: number;

  /**
   * Ventana de la gestión completa, en meses. Equivale a `$W$4`.
   * Define hasta dónde acumulan los KPIs de "Total Gestión".
   */
  @Prop({ required: true, default: 12, min: 1, max: 12 })
  ventanaGestion: number;

  @Prop({
    required: true,
    type: String,
    enum: PgrEstado,
    default: PgrEstado.BORRADOR,
  })
  estado: PgrEstado;

  @Prop({ type: [String], default: [] })
  areas?: string[];

  // Aprobación Global
  @Prop({ required: false })
  aprobadoPor?: string;

  @Prop({ required: false })
  fechaAprobacion?: Date;

  @Prop({ type: [Actividad], default: [] })
  actividades: Actividad[];

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export const PgrSchema = SchemaFactory.createForClass(Pgr);
