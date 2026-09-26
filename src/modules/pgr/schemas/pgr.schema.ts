import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

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

/**
 * Un riesgo concreto que justifica una actividad del PGR.
 *
 * Es una **copia**, no una referencia: si la matriz se versiona o cambia, el
 * PGR ya generado tiene que seguir diciendo lo mismo. La referencia
 * (`matrizId`, `matrizVersion`) se guarda igual para poder rastrear el origen
 * y detectar que la matriz vigente ya es otra.
 */
@Schema({ _id: false })
export class RiesgoCubierto {
  @Prop({ required: true })
  matrizId: string;

  @Prop({ required: true })
  matrizCodigo: string;

  @Prop({ required: true })
  matrizVersion: number;

  @Prop({ required: true })
  areaCodigo: string;

  @Prop({ required: true })
  areaNombre: string;

  @Prop({ required: true })
  riesgoNumero: number;

  /** Actividad de la matriz de la que sale el riesgo. */
  @Prop({ trim: true })
  actividadTarea?: string;

  @Prop({ required: true })
  descripcionRiesgo: string;

  @Prop()
  categoria?: string;

  @Prop({ required: true })
  nivelActual: string;
}

export const RiesgoCubiertoSchema =
  SchemaFactory.createForClass(RiesgoCubierto);

/**
 * Trazabilidad de una actividad generada desde matrices de riesgo.
 *
 * La lista cruza **varias áreas**: el PGR es de la superintendencia y consolida
 * las matrices de todas sus áreas. Si esto apuntara a una sola matriz, al
 * consolidar la segunda área habría que decidir cuál "gana" y se perdería la
 * trazabilidad de la otra.
 */
@Schema({ _id: false })
export class OrigenMatriz {
  /**
   * Clave de consolidación. Dos controles de áreas distintas con el mismo
   * verificador y la misma medida producen **una** actividad: esta clave es
   * lo que lo hace idempotente al reconsolidar.
   */
  @Prop({ required: true, index: true })
  clave: string;

  @Prop({ type: [RiesgoCubiertoSchema], default: [] })
  riesgosCubiertos: RiesgoCubierto[];

  /** Máximo de **todos** los riesgos cubiertos; determina la prioridad. */
  @Prop({ required: true })
  nivelRiesgoMaximo: string;

  @Prop({ required: true })
  generadoEn: Date;

  @Prop()
  actualizadoEn?: Date;
}

export const OrigenMatrizSchema = SchemaFactory.createForClass(OrigenMatriz);

/**
 * Quién responde por una actividad.
 *
 * Puede ser un **grupo** —«Supervisores de Mantenimiento Chancado»— que se
 * resuelve contra el roster y alcanza a todos sus miembros, o un **trabajador**
 * suelto cuando no hay grupo que lo cubra. Las dos formas conviven en la misma
 * lista porque en la práctica ocurren las dos.
 */
@Schema({ _id: false })
export class ResponsableActividad {
  @Prop({ required: true, enum: ['grupo', 'trabajador'] })
  tipo: 'grupo' | 'trabajador';

  /** `_id` del grupo, o `ci` del trabajador. */
  @Prop({ required: true })
  referencia: string;

  /** Denormalizado para mostrar sin resolver el grupo en cada lectura. */
  @Prop({ required: true })
  nombre: string;
}

export const ResponsableActividadSchema =
  SchemaFactory.createForClass(ResponsableActividad);

/**
 * Recurso asignado: cantidad y unidad.
 *
 * Hoy la única unidad en uso es `HH` (horas hombre), la misma que rotula la
 * columna «Recursos (HH $)» del formulario. Se guarda como cantidad y no como
 * texto para poder sumar el esfuerzo del programa — antes era texto libre y en
 * la base había «dsa» y «qwe».
 */
@Schema({ _id: false })
export class RecursoActividad {
  @Prop({ required: true, min: 0 })
  cantidad: number;

  /** Código de la unidad; sale del catálogo, no de una lista en el código. */
  @Prop({ required: true })
  unidad: string;
}

export const RecursoActividadSchema =
  SchemaFactory.createForClass(RecursoActividad);

@Schema()
export class Actividad {
  @Prop({ required: true })
  descripcion: string;

  /**
   * Áreas de la superintendencia a las que aplica la actividad.
   *
   * **Vacío significa todas.** Se eligió así y no listarlas explícitamente
   * para que sumar un área a la superintendencia en el IAM no deje fuera a las
   * actividades generales ya cargadas.
   *
   * Es un dato interno —sirve para acotar, filtrar y editar— y **no viaja al
   * Excel**: ahí el alcance se sigue leyendo del texto de la actividad, que es
   * como lo espera el formulario oficial.
   */
  @Prop({ type: [String], default: [] })
  areas: string[];

  /**
   * Responsables, recursos y entregables son **propios del PGR**: no salen de
   * la matriz. Una actividad recién consolidada nace sin ellos y se completan
   * antes de aprobar el PGR (lo valida `PgrService.aprobar`).
   */
  @Prop({ type: [ResponsableActividadSchema], default: [] })
  responsables: ResponsableActividad[];

  @Prop({ required: true })
  verificador: string;

  @Prop({ type: [RecursoActividadSchema], default: [] })
  recursos: RecursoActividad[];

  /** Normalmente uno, pero el modelo admite varios. */
  @Prop({ type: [String], default: [] })
  entregables: string[];

  /** Presente solo si la actividad se generó desde una matriz de riesgos. */
  @Prop({ type: OrigenMatrizSchema })
  origenMatriz?: OrigenMatriz;

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

/**
 * No se borra: pasa a inactivo y deja de aparecer en las consultas.
 *
 * Borrarlo dejaria senalando al vacio a todo lo que lo referencia.
 */
PgrSchema.plugin(bajaLogica);
