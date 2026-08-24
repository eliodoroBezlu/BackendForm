import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CATEGORIAS,
  CONDICIONES,
  ESCALA_NIVELES,
} from '../domain/nivel-riesgo';
import { CALIDADES_CONTROL, EFICACIAS } from '../domain/eficacia-control.util';

export enum EstadoMatriz {
  BORRADOR = 'BORRADOR',
  EN_REVISION = 'EN_REVISION',
  APROBADA = 'APROBADA',
  /** Reemplazada por una versión posterior ya aprobada. */
  SUPERADA = 'SUPERADA',
}

export type MatrizRiesgoDocument = MatrizRiesgo & Document;

/**
 * Un control declarado para un riesgo (columnas P–V de la matriz).
 *
 * En el Excel es una fila dentro del bloque del riesgo. La matriz real llega a
 * 18 controles en un mismo riesgo, así que **no hay un límite de 16** pese a
 * que la plantilla vacía traiga bloques de ese tamaño pre-formateados.
 */
@Schema({ _id: false })
export class ControlRiesgo {
  /** Familia de Controles / Acciones (col P). Valor de catálogo. */
  @Prop({ required: true, trim: true })
  familiaControl: string;

  /** Medida de prevención, control y mitigación (col Q). Texto libre. */
  @Prop({ required: true, trim: true })
  medida: string;

  /** Familia de Verificadores (col R). Valor de catálogo. */
  @Prop({ trim: true })
  familiaVerificador?: string;

  /**
   * Verificador concreto (col S). **Es el puente hacia el PGR**: cada control
   * de un riesgo SUSTANCIAL o INACEPTABLE propone una actividad, agrupada por
   * este valor. Sin verificador el control no es medible, así que se exige.
   */
  @Prop({ required: true, trim: true, index: true })
  verificador: string;

  /** Calidad del Control (col T): % de implementación real. */
  @Prop({ required: true, enum: CALIDADES_CONTROL })
  calidadControl: string;

  /** Jerarquía del Control (col U), con su prefijo numérico 6…1. */
  @Prop({ required: true, trim: true })
  jerarquiaControl: string;

  /**
   * Eficacia (col V) — **derivada** de calidad × jerarquía.
   * Se persiste para poder consultar y exportar sin recalcular, pero nunca se
   * acepta del cliente: el servicio la recalcula en cada escritura.
   */
  @Prop({ enum: EFICACIAS })
  eficacia?: string;
}

export const ControlRiesgoSchema = SchemaFactory.createForClass(ControlRiesgo);

/**
 * Un riesgo identificado y evaluado (columnas F–O y W del Excel).
 *
 * En la planilla ocupa un bloque de filas con las columnas A–O combinadas: un
 * riesgo, N controles. Aquí los controles van embebidos porque el nivel
 * residual depende del **conjunto** — es una invariante de agregado y
 * recalcularla debe ser atómico.
 *
 * El encabezado (área, actividad, condición y categoría, columnas B–E) **no**
 * vive acá sino en `ActividadRiesgo`: se repetía idéntico en todos los riesgos
 * de una misma tarea y esa repetición era la fuente de divergencias por tipeo.
 */
@Schema({ _id: false })
export class RiesgoIdentificado {
  /**
   * Correlativo **global dentro de la matriz** (col A), no por actividad.
   *
   * Es la referencia que el PGR guarda en
   * `origenMatriz.riesgosCubiertos[].riesgoNumero`, así que no puede
   * reasignarse una vez que la matriz se aprobó y consolidó.
   */
  @Prop({ required: true })
  numero: number;

  @Prop({ required: true, trim: true })
  familiaPeligro: string;

  @Prop({ required: true, trim: true })
  descripcionPeligro: string;

  @Prop({ required: true, trim: true })
  familiaRiesgo: string;

  @Prop({ required: true, trim: true })
  descripcionRiesgo: string;

  // ── Evaluación: los tres únicos valores que ingresa el usuario ───────────
  @Prop({ required: true, min: 1, max: 6 })
  exposicion: number;

  @Prop({ required: true, min: 1, max: 6 })
  posibilidad: number;

  @Prop({ required: true, min: 1, max: 5 })
  severidad: number;

  // ── Derivados: calculados siempre en el servidor ─────────────────────────
  /** Probabilidad (col L), de la tabla 6×6. */
  @Prop({ min: 1, max: 5 })
  probabilidad?: number;

  /** Resultado (col N) = probabilidad × severidad. */
  @Prop({ min: 1, max: 25 })
  resultado?: number;

  /** Nivel inicial o «puro» (col O), antes de controles. */
  @Prop({ enum: ESCALA_NIVELES })
  nivelInicial?: string;

  /** Nivel actual o residual (col W), tras aplicar los controles. */
  @Prop({ enum: ESCALA_NIVELES, index: true })
  nivelActual?: string;

  @Prop({ type: [ControlRiesgoSchema], default: [] })
  controles: ControlRiesgo[];

  /** Incidentes Ocurridos (col X). */
  @Prop({ trim: true })
  incidentesOcurridos?: string;

  /** Trazabilidad / Historial / Observaciones (col Y). */
  @Prop({ trim: true })
  trazabilidad?: string;
}

export const RiesgoIdentificadoSchema =
  SchemaFactory.createForClass(RiesgoIdentificado);

/**
 * Una actividad o tarea con los riesgos que se le identificaron (cols B–E).
 *
 * ── Qué define una actividad ───────────────────────────────────────────────
 *
 * La **tupla completa del encabezado**: área + tarea + condición + categoría.
 * No solo el nombre.
 *
 * En el Excel las columnas A–O están combinadas **por riesgo**, no por
 * actividad: no existe un "bloque de actividad", solo filas que repiten los
 * mismos cuatro valores. Agrupar por la tupla es la lectura fiel y sin
 * pérdida — si una misma tarea tiene un riesgo de Seguridad y otro de Salud,
 * quedan en dos actividades con igual `actividadTarea`, que es exactamente lo
 * que hace la planilla.
 *
 * Consecuencia: `categoria` decide qué catálogos se ofrecen, así que todos los
 * riesgos de una actividad comparten catálogo.
 */
@Schema({ _id: false })
export class ActividadRiesgo {
  /** Correlativo de la actividad dentro de la matriz. */
  @Prop({ required: true })
  numero: number;

  /** Área / Proceso / Alcance (col B). Texto libre, no catálogo. */
  @Prop({ required: true, trim: true })
  areaProcesoAlcance: string;

  /** Actividad / Tarea / Grupo de Interés (col C). Texto libre. */
  @Prop({ required: true, trim: true })
  actividadTarea: string;

  @Prop({ required: true, enum: CONDICIONES })
  condicion: string;

  /**
   * Categoría (col E). **Discriminador maestro**: determina qué catálogos
   * aplican y qué etiquetas de jerarquía se ofrecen.
   */
  @Prop({ required: true, enum: CATEGORIAS, index: true })
  categoria: string;

  @Prop({ type: [RiesgoIdentificadoSchema], default: [] })
  riesgos: RiesgoIdentificado[];
}

export const ActividadRiesgoSchema =
  SchemaFactory.createForClass(ActividadRiesgo);

/** Entrada del historial de cambios de estado. */
@Schema({ _id: false })
export class HistorialMatriz {
  @Prop({ required: true })
  usuario: string;

  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  estadoAnterior: string;

  @Prop({ required: true })
  estadoNuevo: string;

  @Prop()
  observaciones?: string;
}

export const HistorialMatrizSchema =
  SchemaFactory.createForClass(HistorialMatriz);

/**
 * Matriz de Identificación y Evaluación de Riesgos (formulario 1.02.P06.F01).
 *
 * **Una matriz pertenece a un ÁREA.** El PGR, en cambio, es de la
 * SUPERINTENDENCIA y consolida las matrices de todas sus áreas — por eso la
 * superintendencia se guarda aquí denormalizada: es la clave por la que el
 * generador de PGR agrupa.
 *
 * Es **inmutable una vez aprobada**: editar significa crear la versión N+1.
 * Así, un PGR ya generado nunca cambia porque alguien retocó la matriz.
 */
@Schema({ timestamps: true })
export class MatrizRiesgo {
  /** Código legible: `MR-<AREA>-<AÑO>-v<N>`. */
  @Prop({ required: true, unique: true, trim: true })
  codigo: string;

  @Prop({ required: true, trim: true, index: true })
  areaCodigo: string;

  @Prop({ required: true, trim: true })
  areaNombre: string;

  /**
   * Denormalizada desde el maestro de áreas. Al importar hay que **validarla**
   * contra el maestro: si el Excel dice una superintendencia y el maestro otra,
   * la consolidación terminaría en el PGR equivocado.
   */
  @Prop({ required: true, trim: true, index: true })
  superintendencia: string;

  @Prop({ trim: true })
  gerencia?: string;

  @Prop({ required: true, index: true })
  anio: number;

  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  /** Versión anterior de la cadena, si esta es una revisión. */
  @Prop({ type: Types.ObjectId, ref: 'MatrizRiesgo' })
  matrizAnteriorId?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: EstadoMatriz,
    default: EstadoMatriz.BORRADOR,
    index: true,
  })
  estado: EstadoMatriz;

  @Prop({ trim: true })
  elaboradoPor?: string;

  @Prop({ trim: true })
  revisadoAprobadoPor?: string;

  @Prop()
  fechaElaboracion?: Date;

  @Prop()
  fechaAprobacion?: Date;

  /**
   * Versión de la metodología con la que se calcularon los derivados. Permite
   * responder «¿por qué en 2025 esto daba SUSTANCIAL?» sin que cambiar hoy una
   * tabla reescriba la historia.
   */
  @Prop({ required: true, default: '1.02.P06.F01-Rev.7' })
  metodologiaVersion: string;

  /**
   * Las actividades de la matriz, cada una con sus riesgos.
   *
   * Reemplaza al antiguo `riesgos[]` plano. Para recorrer todos los riesgos:
   * `matriz.actividades.flatMap((a) => a.riesgos)`.
   */
  @Prop({ type: [ActividadRiesgoSchema], default: [] })
  actividades: ActividadRiesgo[];

  @Prop({ type: [HistorialMatrizSchema], default: [] })
  historial: HistorialMatriz[];

  /** Nombre del archivo del que se importó, si vino de un Excel. */
  @Prop({ trim: true })
  archivoOrigen?: string;

  @Prop({ default: true })
  activo: boolean;
}

export const MatrizRiesgoSchema = SchemaFactory.createForClass(MatrizRiesgo);

// Una sola matriz por área, año y versión.
MatrizRiesgoSchema.index(
  { areaCodigo: 1, anio: 1, version: 1 },
  { unique: true },
);

// Consulta del generador de PGR: matrices aprobadas de una superintendencia
// en una gestión.
MatrizRiesgoSchema.index({ superintendencia: 1, anio: 1, estado: 1 });
