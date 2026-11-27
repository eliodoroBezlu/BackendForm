/**
 * Reglas de los meses de un formulario de Sistemas de Emergencia (uno por tag, semestre y año).
 *
 * Por qué existe: en agosto de 2026 la pantalla mandó «crear formulario» para 26 tags que ya
 * tenían el suyo (con julio), y el servidor de entonces insertó una copia con julio + agosto. Desde
 * el 24/08 el servidor devolvía el existente **sin guardar el mes enviado**: el inspector veía
 * «guardado» y el mes se perdía. Ahora los meses nuevos se agregan al formulario existente.
 *
 * Función pura: se prueba sin base de datos.
 */
import { MESES } from './consulta-reporte';

export type Periodo = 'ENERO-JUNIO' | 'JULIO-DICIEMBRE';

export const esMesValido = (mes: string): boolean =>
  (MESES as readonly string[]).includes(mes);

/** El semestre al que pertenece un mes. */
export const periodoDeMes = (mes: string): Periodo =>
  MESES.indexOf(mes as (typeof MESES)[number]) < 6
    ? 'ENERO-JUNIO'
    : 'JULIO-DICIEMBRE';

/** El último mes (en el calendario) de una lista; `null` si no hay ninguno válido. */
export function ultimoMes(meses: Iterable<string>): string | null {
  let ultimo: string | null = null;
  for (const mes of meses) {
    if (!esMesValido(mes)) continue;
    if (
      ultimo === null ||
      MESES.indexOf(mes as (typeof MESES)[number]) >
        MESES.indexOf(ultimo as (typeof MESES)[number])
    ) {
      ultimo = mes;
    }
  }
  return ultimo;
}

/**
 * Meses que trae un envío y que el formulario guardado no tiene, en orden de calendario y solo
 * del semestre del formulario. Los meses ya guardados **no** se tocan: están firmados.
 */
export function mesesQueFaltan(
  guardados: Iterable<string>,
  enviados: Record<string, unknown> | null | undefined,
  periodo: Periodo,
): string[] {
  const yaEstan = new Set(guardados);
  return MESES.filter(
    (mes) =>
      !!enviados?.[mes] && !yaEstan.has(mes) && periodoDeMes(mes) === periodo,
  );
}

/** Los meses guardados de un formulario, venga de Mongoose (`Map`) o como objeto plano. */
export const mesesGuardados = (
  meses: Map<string, unknown> | Record<string, unknown> | null | undefined,
): string[] =>
  meses instanceof Map ? [...meses.keys()] : Object.keys(meses ?? {});
