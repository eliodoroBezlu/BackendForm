import { CategoriaRiesgo } from './nivel-riesgo';
import { textoNormalizado } from './texto-celda';

/**
 * Eficacia del control (columna V) = f(Jerarquía, Calidad).
 *
 * ── Fórmula original ───────────────────────────────────────────────────────
 *
 *   IFERROR(IF(AA="SEGURIDAD",       OFFSET(PARÁMETROS!$K$2,  MATCH(U,JC_SE,0), MATCH(T,CC_SE,0)),
 *           IF(AA="DSRC/…",          OFFSET(PARÁMETROS!$K$11, …),
 *           IF(AA="SALUD",           OFFSET(PARÁMETROS!$K$29, …),
 *           …ocho ramas…             ))), "")
 *
 * Parece que hubiera una matriz distinta por categoría —y por eso la fórmula
 * ocupa 8 líneas—, pero al comparar los 8 bloques de `PARÁMETROS` (filas 3-8,
 * 12-17, 21-26, 30-35, 39-44, 48-53, 57-62 y 66-71) **son idénticos celda por
 * celda**. Lo único que cambia son las *etiquetas* de la jerarquía en DSRC.
 *
 * Por eso aquí hay una sola matriz indexada por el **nivel numérico** (6…1),
 * que es el dato estable, y las etiquetas se resuelven aparte. Replicar las 8
 * ramas sería copiar ocho veces la misma tabla.
 */

export const CALIDADES_CONTROL = [
  'C. Menor a 50%',
  'B. 50% y 80%',
  'A. Mayor 80%',
] as const;

export type CalidadControl = (typeof CALIDADES_CONTROL)[number];

export const EFICACIAS = [
  'Control/Acción No Eficaz',
  'Control/Acción Satisfactorio',
  'Control/Acción Eficaz',
] as const;

export type EficaciaControl = (typeof EFICACIAS)[number];

/** Nivel de la jerarquía de control: 6 (más efectivo) … 1 (menos). */
export type NivelJerarquia = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Etiquetas de la jerarquía por familia de categorías.
 *
 * DSRC (Desarrollo Sostenible y Relaciones Comunitarias) usa una jerarquía
 * propia: no tiene sentido hablar de "EPP" o "Ingeniería" para gestionar
 * relaciones con comunidades.
 */
export const JERARQUIA_ESTANDAR: Record<NivelJerarquia, string> = {
  6: '6. Eliminación',
  5: '5. Sustitución/ Minimización',
  4: '4. Ingeniería',
  3: '3. Señalización/ Advertencias/ Alarma',
  2: '2. Administrativo/ Procedimientos/ Capacitación',
  1: '1. EPP',
};

export const JERARQUIA_DSRC: Record<NivelJerarquia, string> = {
  6: '6. Acuerdos estratégicos/Convenios estratégicos',
  5: '5. Acuerdos específicos/Convenios específicos',
  4: '4. Planes estratégicos',
  3: '3. Intervenciones directas',
  2: '2. Reuniones formales',
  1: '1. Relacionamientos',
};

export function jerarquiaDeCategoria(
  categoria: CategoriaRiesgo,
): Record<NivelJerarquia, string> {
  return categoria === 'DSRC/Estratégico' || categoria === 'DSRC/Operativo'
    ? JERARQUIA_DSRC
    : JERARQUIA_ESTANDAR;
}

/**
 * Matriz de eficacia, indexada `[nivelJerarquia][calidad]`.
 *
 * Lectura del negocio: la calidad de implementación manda sobre la jerarquía
 * —un control administrativo bien implementado es Eficaz—, pero **el EPP nunca
 * llega a Eficaz** por muy bien implementado que esté. Es coherente con la
 * jerarquía de controles: el EPP es la última barrera, no una solución.
 */
const MATRIZ_EFICACIA: Record<
  NivelJerarquia,
  Record<CalidadControl, EficaciaControl>
> = {
  6: {
    'C. Menor a 50%': 'Control/Acción Satisfactorio',
    'B. 50% y 80%': 'Control/Acción Satisfactorio',
    'A. Mayor 80%': 'Control/Acción Eficaz',
  },
  5: {
    'C. Menor a 50%': 'Control/Acción Satisfactorio',
    'B. 50% y 80%': 'Control/Acción Satisfactorio',
    'A. Mayor 80%': 'Control/Acción Eficaz',
  },
  4: {
    'C. Menor a 50%': 'Control/Acción No Eficaz',
    'B. 50% y 80%': 'Control/Acción Satisfactorio',
    'A. Mayor 80%': 'Control/Acción Eficaz',
  },
  3: {
    'C. Menor a 50%': 'Control/Acción No Eficaz',
    'B. 50% y 80%': 'Control/Acción Satisfactorio',
    'A. Mayor 80%': 'Control/Acción Eficaz',
  },
  2: {
    'C. Menor a 50%': 'Control/Acción No Eficaz',
    'B. 50% y 80%': 'Control/Acción Satisfactorio',
    'A. Mayor 80%': 'Control/Acción Eficaz',
  },
  1: {
    'C. Menor a 50%': 'Control/Acción No Eficaz',
    'B. 50% y 80%': 'Control/Acción No Eficaz',
    'A. Mayor 80%': 'Control/Acción Satisfactorio',
  },
};

/**
 * Extrae el nivel numérico de una etiqueta de jerarquía (`"4. Ingeniería"` → 4).
 *
 * El prefijo numérico es parte del dato en el Excel y es lo único común entre
 * la jerarquía estándar y la de DSRC, así que es la clave correcta para
 * indexar. Devuelve `null` si la etiqueta no lo trae.
 */
export function nivelJerarquiaDesdeEtiqueta(
  etiqueta: unknown,
): NivelJerarquia | null {
  const texto = textoNormalizado(etiqueta);
  if (texto === null) return null;
  const m = /^\s*([1-6])\s*\./.exec(texto);
  return m ? (Number(m[1]) as NivelJerarquia) : null;
}

/** Normaliza el texto de calidad tal como viene del Excel. */
export function normalizarCalidad(texto: unknown): CalidadControl | null {
  const limpio = textoNormalizado(texto)?.toUpperCase();
  if (!limpio) return null;
  return (
    CALIDADES_CONTROL.find((c) => c.toUpperCase() === limpio) ??
    // Tolerancia: en algunas matrices se escribió solo la letra.
    CALIDADES_CONTROL.find((c) => c.toUpperCase().startsWith(limpio + '.')) ??
    null
  );
}

/** Normaliza el texto de eficacia (usado al leer matrices ya calculadas). */
export function normalizarEficacia(texto: unknown): EficaciaControl | null {
  const limpio = textoNormalizado(texto)?.toUpperCase();
  if (!limpio) return null;
  return EFICACIAS.find((e) => e.toUpperCase() === limpio) ?? null;
}

/**
 * Eficacia de un control. `null` si falta cualquiera de los dos ejes —igual
 * que el `IFERROR(..., "")` del Excel, que deja la celda vacía.
 */
export function calcularEficacia(
  jerarquia: NivelJerarquia | null,
  calidad: CalidadControl | null,
): EficaciaControl | null {
  if (jerarquia === null || calidad === null) return null;
  return MATRIZ_EFICACIA[jerarquia][calidad];
}

/** Variante que acepta directamente los textos del Excel. */
export function calcularEficaciaDesdeTextos(
  etiquetaJerarquia: unknown,
  textoCalidad: unknown,
): EficaciaControl | null {
  return calcularEficacia(
    nivelJerarquiaDesdeEtiqueta(etiquetaJerarquia),
    normalizarCalidad(textoCalidad),
  );
}

export const esEficaz = (e: EficaciaControl): boolean =>
  e === 'Control/Acción Eficaz';

export const esNoEficaz = (e: EficaciaControl): boolean =>
  e === 'Control/Acción No Eficaz';
