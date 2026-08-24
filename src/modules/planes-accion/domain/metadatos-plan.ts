/**
 * Reglas de cálculo del plan de acción.
 *
 * TypeScript puro: sin Nest, sin Mongoose, sin acceso a base de datos. Las
 * entradas son formas estructurales, no documentos — así estas reglas se pueden
 * probar con objetos literales, que es justamente lo que faltaba: la lógica
 * vivía dentro de métodos privados del servicio y solo era alcanzable
 * levantando el módulo entero.
 */

/** Estados que puede tener una tarea. El plan deriva el suyo de estos. */
export const ESTADO_ABIERTO = 'abierto';
export const ESTADO_EN_PROGRESO = 'en-progreso';
export const ESTADO_CERRADO = 'cerrado';

/** Lo mínimo que necesita una tarea para participar en los cálculos. */
export interface TareaCalculable {
  estado?: string;
  activo?: boolean;
}

export interface MetadatosDelPlan {
  totalTareas: number;
  tareasAbiertas: number;
  tareasEnProgreso: number;
  tareasCerradas: number;
  porcentajeCierre: number;
  estado: string;
}

export interface EstadisticasDePlanes {
  totalPlanes: number;
  planesAbiertos: number;
  planesEnProgreso: number;
  planesCerrados: number;
  porcentajeCierre: number;
}

const MILISEGUNDOS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Las tareas nunca se borran: se dan de baja con `activo: false`. Todo lo que
 * se muestra o se cuenta debe pasar antes por aquí.
 *
 * La comparación es `!== false` y no `=== true` a propósito: las tareas
 * creadas antes de que existiera el campo no lo tienen, y esas cuentan como
 * activas.
 */
export const soloTareasActivas = <T extends TareaCalculable>(
  tareas: readonly T[] | undefined | null,
): T[] => (tareas ?? []).filter((tarea) => tarea.activo !== false);

/**
 * Días de retraso de una tarea cerrada.
 *
 * Ambas fechas se normalizan a medianoche: lo que importa es la diferencia de
 * días de calendario, no las horas. Cerrar a las 23:00 del día acordado son 0
 * días de retraso, no 1.
 *
 * Adelantarse no resta: una tarea cerrada antes de tiempo tiene 0 de retraso,
 * nunca un número negativo.
 */
export const calcularDiasRetraso = (
  fechaAcordada: Date,
  fechaEfectiva?: Date | null,
): number => {
  if (!fechaEfectiva) return 0;

  const acordada = new Date(fechaAcordada);
  const efectiva = new Date(fechaEfectiva);
  if (Number.isNaN(acordada.getTime()) || Number.isNaN(efectiva.getTime())) {
    return 0;
  }

  acordada.setHours(0, 0, 0, 0);
  efectiva.setHours(0, 0, 0, 0);

  const dias = Math.ceil(
    (efectiva.getTime() - acordada.getTime()) / MILISEGUNDOS_POR_DIA,
  );

  return Math.max(0, dias);
};

/**
 * Deriva los contadores y el estado del plan a partir de sus tareas.
 *
 * El estado del plan **no se guarda a mano**: es una consecuencia de las
 * tareas. Las reglas, en orden:
 *
 * - `cerrado`     → todas las tareas están cerradas (y hay al menos una).
 * - `en-progreso` → hay movimiento: alguna en progreso o alguna cerrada.
 * - `abierto`     → no ha empezado nada. También es el estado de un plan sin
 *                   tareas: un plan vacío no está cerrado, está sin empezar.
 */
export const calcularMetadatos = (
  tareas: readonly TareaCalculable[],
): MetadatosDelPlan => {
  const totalTareas = tareas.length;
  const cuenta = (estado: string) =>
    tareas.filter((tarea) => tarea.estado === estado).length;

  const tareasAbiertas = cuenta(ESTADO_ABIERTO);
  const tareasEnProgreso = cuenta(ESTADO_EN_PROGRESO);
  const tareasCerradas = cuenta(ESTADO_CERRADO);

  const porcentajeCierre =
    totalTareas > 0 ? Math.round((tareasCerradas / totalTareas) * 100) : 0;

  let estado: string;
  if (totalTareas > 0 && tareasCerradas === totalTareas) {
    estado = ESTADO_CERRADO;
  } else if (tareasEnProgreso > 0 || tareasCerradas > 0) {
    estado = ESTADO_EN_PROGRESO;
  } else {
    estado = ESTADO_ABIERTO;
  }

  return {
    totalTareas,
    tareasAbiertas,
    tareasEnProgreso,
    tareasCerradas,
    porcentajeCierre,
    estado,
  };
};
