import { paraComparar } from './texto-celda';

/**
 * Vocabulario de la metodología IPER (formulario 1.02.P06.F01 Rev.7).
 *
 * TypeScript puro: sin Nest, sin Mongoose, sin dependencias. Todo el motor de
 * evaluación vive en `domain/` para poder testearlo aislado contra el Excel
 * real (ver `__fixtures__/matriz-chancado.fixture.ts`).
 */

/**
 * Los 5 niveles de riesgo, **en orden ascendente de gravedad**.
 *
 * El orden no es decorativo: el nivel residual se calcula bajando escalones
 * sobre este arreglo, así que `ESCALA_NIVELES.indexOf()` es parte del
 * algoritmo, no una comodidad de presentación.
 */
export const ESCALA_NIVELES = [
  'ACEPTABLE',
  'BAJA',
  'ACEPTABLE CON REVISIÓN',
  'SUSTANCIAL',
  'INACEPTABLE',
] as const;

export type NivelRiesgo = (typeof ESCALA_NIVELES)[number];

/**
 * Niveles que obligan a gestionar el riesgo mediante actividades del PGR.
 *
 * Confirmado con el área de Seguridad y contra datos reales: en la matriz de
 * Planta Chancado son 12 riesgos de 39. El umbral se expone como constante
 * para poder volverlo configurable sin tocar el algoritmo.
 */
export const NIVELES_QUE_REQUIEREN_PGR: readonly NivelRiesgo[] = [
  'SUSTANCIAL',
  'INACEPTABLE',
];

export function requierePgr(nivel: NivelRiesgo): boolean {
  return NIVELES_QUE_REQUIEREN_PGR.includes(nivel);
}

/**
 * Normaliza el texto de un nivel tal como viene del Excel.
 *
 * La planilla original emite `"ACEPTABLE CON REVISIÓN "` **con espacio final**
 * en 3 de sus ramas. No cambia ningún resultado —es un descuido de la fórmula—
 * pero rompe cualquier comparación de strings, así que se normaliza al leer y
 * el sistema siempre emite la forma canónica.
 *
 * Devuelve `null` si el texto no corresponde a ningún nivel conocido; que el
 * llamador decida si eso es un error o una celda vacía.
 */
export function normalizarNivel(texto: unknown): NivelRiesgo | null {
  const limpio = paraComparar(texto);
  if (limpio === null) return null;

  return (
    ESCALA_NIVELES.find(
      (nivel) => nivel.normalize('NFD').replace(/[̀-ͯ]/g, '') === limpio,
    ) ?? null
  );
}

/** Posición en la escala. `-1` si el nivel no es válido. */
export function ordenNivel(nivel: NivelRiesgo): number {
  return ESCALA_NIVELES.indexOf(nivel);
}

/**
 * Baja `escalones` posiciones en la escala, con piso en `ACEPTABLE`.
 * Es la operación central del cálculo del nivel residual.
 */
export function bajarNivel(nivel: NivelRiesgo, escalones: number): NivelRiesgo {
  const destino = Math.max(0, ordenNivel(nivel) - Math.max(0, escalones));
  return ESCALA_NIVELES[destino];
}

// ────────────────────────────────────────────────────────────────────────────
// Categorías
// ────────────────────────────────────────────────────────────────────────────

/**
 * Las 9 categorías de la columna E. Es el **discriminador maestro**: determina
 * qué catálogos se ofrecen (peligro, riesgo, control, verificador) y qué
 * etiquetas de jerarquía aplican.
 */
export const CATEGORIAS = [
  'Seguridad',
  'Salud',
  'Medio Ambiente',
  'Operacional',
  'Legal',
  'DSRC/Estratégico',
  'DSRC/Operativo',
  'Rel. Gubernamentales',
  'Financiero',
] as const;

export type CategoriaRiesgo = (typeof CATEGORIAS)[number];

/** Condiciones de la columna D. */
export const CONDICIONES = [
  'Normal',
  'Anormal',
  'Emergencia',
  'Social',
  'Ambiental',
  'Económico',
  'Político',
] as const;

export type CondicionRiesgo = (typeof CONDICIONES)[number];

/**
 * Forma canónica de una categoría, o `null` si no pertenece al catálogo.
 *
 * Las columnas D y E se llenan a mano, así que la misma categoría aparece
 * escrita de varias formas —`SEGURIDAD` y `Seguridad`, y en cuatro de las
 * matrices de Mantenimiento Planta **las dos dentro del mismo archivo**—.
 * Comparar el texto tal cual traía tres consecuencias, de menor a mayor:
 *
 * 1. La advertencia "Categoría desconocida" sobre una categoría válida.
 * 2. La misma tarea partida en dos actividades, porque la categoría es uno de
 *    los cuatro campos que identifican a la actividad.
 * 3. El guardado directamente rechazado: el esquema declara `enum: CATEGORIAS`.
 *
 * Por eso se canoniza al leer y el sistema solo persiste la forma del catálogo.
 */
export function normalizarCategoria(valor: unknown): CategoriaRiesgo | null {
  const limpio = paraComparar(valor);
  if (limpio === null) return null;
  return CATEGORIAS.find((c) => paraComparar(c) === limpio) ?? null;
}

/** Forma canónica de una condición, o `null`. Mismo motivo que las categorías. */
export function normalizarCondicion(valor: unknown): CondicionRiesgo | null {
  const limpio = paraComparar(valor);
  if (limpio === null) return null;
  return CONDICIONES.find((c) => paraComparar(c) === limpio) ?? null;
}
