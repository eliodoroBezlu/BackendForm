import { NivelRiesgo, ESCALA_NIVELES } from './nivel-riesgo';

/**
 * Evaluación del riesgo puro (columnas J–O de la matriz 1.02.P06.F01).
 *
 * ── Fórmulas originales ────────────────────────────────────────────────────
 *
 *   L (Probabilidad):
 *     IF(OR(J<>"",K<>""), OFFSET('PARÁMETROS'!$B$2, K, J), "")
 *
 *   N (Resultado):
 *     IFERROR(L*M, "")
 *
 *   O (Nivel Inicial / Puro):
 *     IF(N<=2,"ACEPTABLE",
 *     IF(N<=6,"BAJA",
 *     IF(N<=10,"ACEPTABLE CON REVISIÓN",
 *     IF(N<=15,"SUSTANCIAL","INACEPTABLE"))))
 *
 * Verificado 39/39 contra `Matriz de Riesgo Mantto Planta Chancado.xlsx`.
 */

/** Valores admitidos de Exposición y Posibilidad (columnas J y K). */
export type ValorExposicion = 1 | 2 | 3 | 4 | 5 | 6;
export type ValorPosibilidad = 1 | 2 | 3 | 4 | 5 | 6;
/** Severidad (columna M). */
export type ValorSeveridad = 1 | 2 | 3 | 4 | 5;

/**
 * Tabla de Probabilidad = f(Exposición, Posibilidad), en `PARÁMETROS!B2:H8`.
 *
 * ⚠️ **No es multiplicativa ni monótona**: es una tabla de decisión y hay que
 * replicarla literalmente. Intentar aproximarla con una fórmula da resultados
 * distintos (p. ej. Exp=1,Pos=1 → 5, pero Exp=6,Pos=6 → 1: la escala va al
 * revés de lo que sugiere la intuición).
 *
 * Indexada `[posibilidad - 1][exposicion - 1]`, igual que el `OFFSET(B2, K, J)`
 * del Excel.
 */
export const TABLA_PROBABILIDAD: readonly (readonly number[])[] = [
  //  Exp: 1  2  3  4  5  6
  /* Pos 1 */ [5, 5, 4, 4, 3, 3],
  /* Pos 2 */ [5, 5, 4, 3, 3, 3],
  /* Pos 3 */ [4, 4, 4, 3, 2, 2],
  /* Pos 4 */ [4, 3, 3, 2, 2, 1],
  /* Pos 5 */ [3, 3, 2, 2, 1, 1],
  /* Pos 6 */ [3, 3, 2, 1, 1, 1],
];

/** Cortes de `N` que definen el nivel inicial. Orden: de menor a mayor. */
const CORTES_NIVEL: readonly { hasta: number; nivel: NivelRiesgo }[] = [
  { hasta: 2, nivel: 'ACEPTABLE' },
  { hasta: 6, nivel: 'BAJA' },
  { hasta: 10, nivel: 'ACEPTABLE CON REVISIÓN' },
  { hasta: 15, nivel: 'SUSTANCIAL' },
];

const esEnteroEntre = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Probabilidad (columna L) a partir de exposición y posibilidad.
 * Devuelve `null` si algún valor está fuera de rango — el llamador decide si
 * eso es un error de captura o una fila incompleta.
 */
export function calcularProbabilidad(
  exposicion: number,
  posibilidad: number,
): number | null {
  if (!esEnteroEntre(exposicion, 1, 6) || !esEnteroEntre(posibilidad, 1, 6)) {
    return null;
  }
  return TABLA_PROBABILIDAD[posibilidad - 1][exposicion - 1];
}

/** Resultado de la evaluación (columna N) = Probabilidad × Severidad. */
export function calcularResultado(
  probabilidad: number | null,
  severidad: number,
): number | null {
  if (probabilidad === null || !esEnteroEntre(severidad, 1, 5)) return null;
  return probabilidad * severidad;
}

/**
 * Nivel de riesgo inicial o «puro» (columna O), antes de considerar controles.
 */
export function calcularNivelInicial(
  resultado: number | null,
): NivelRiesgo | null {
  if (resultado === null || !Number.isFinite(resultado)) return null;
  const corte = CORTES_NIVEL.find((c) => resultado <= c.hasta);
  return corte ? corte.nivel : 'INACEPTABLE';
}

export interface EntradaEvaluacion {
  exposicion: number;
  posibilidad: number;
  severidad: number;
}

export interface ResultadoEvaluacion {
  probabilidad: number | null;
  resultado: number | null;
  nivelInicial: NivelRiesgo | null;
}

/**
 * Encadena las tres columnas derivadas. Es la función que consume el servicio:
 * el cliente manda solo exposición, posibilidad y severidad; el resto **nunca**
 * se acepta desde fuera.
 */
export function evaluarRiesgoPuro(
  entrada: EntradaEvaluacion,
): ResultadoEvaluacion {
  const probabilidad = calcularProbabilidad(
    entrada.exposicion,
    entrada.posibilidad,
  );
  const resultado = calcularResultado(probabilidad, entrada.severidad);
  return {
    probabilidad,
    resultado,
    nivelInicial: calcularNivelInicial(resultado),
  };
}

/**
 * Coordenadas del riesgo en el mapa de calor Probabilidad × Severidad.
 * Se expone desde el dominio para que el heatmap del frontend no reimplemente
 * la escala por su cuenta.
 */
export function celdaMapaCalor(
  probabilidad: number | null,
  severidad: number,
): { fila: number; columna: number; nivel: NivelRiesgo } | null {
  const resultado = calcularResultado(probabilidad, severidad);
  const nivel = calcularNivelInicial(resultado);
  if (probabilidad === null || nivel === null) return null;
  return { fila: severidad, columna: probabilidad, nivel };
}

/** Reexportado por comodidad para quien solo importe este módulo. */
export { ESCALA_NIVELES };
