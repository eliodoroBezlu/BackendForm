/**
 * Comparación tolerante de nombres organizacionales (superintendencias, áreas).
 *
 * El mismo nombre se escribe distinto en cada documento y en cada maestro:
 *
 *   Matriz IPER → "Superintendencia de Mantenimiento - Mec. Plta. Chancado…"
 *   PGR         → "Superintendencia de Mantenimiento - Mec. Planta Chancado…"
 *
 * Ninguno contiene al otro por culpa de `Plta.` / `Planta`, así que comparar
 * por igualdad o por contención da falso en casos que son claramente la misma
 * entidad. Peor: el maestro arrastra **las dos variantes como registros
 * distintos**, así que el problema no se resuelve solo eligiendo una.
 *
 * Se compara por solape de palabras significativas, que es robusto frente a
 * abreviaturas, tildes y puntuación sin necesitar un diccionario de sinónimos
 * que siempre estaría incompleto.
 */

/** Palabras que no distinguen una entidad de otra. */
const VACIAS = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'EL',
  'Y',
  'SUPERINTENDENCIA',
  'GERENCIA',
  'AREA',
]);

/** Mayúsculas, sin tildes y con espacios colapsados. */
export function normalizarNombre(valor: string): string {
  return valor
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function significativas(valor: string): Set<string> {
  return new Set(
    normalizarNombre(valor)
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !VACIAS.has(t)),
  );
}

/**
 * ¿Los dos textos nombran la misma entidad?
 *
 * `umbral` es la fracción de palabras significativas que deben coincidir,
 * medida sobre el nombre más corto. 0.6 tolera abreviaturas y una palabra
 * extra sin llegar a confundir superintendencias distintas.
 *
 * Un nombre sin ninguna palabra significativa **no coincide con nada**.
 * «Superintendencia TO» es exactamente ese caso: `SUPERINTENDENCIA` es palabra
 * vacía y `TO` no llega a tres letras, así que queda el conjunto vacío. Cuando
 * esto devolvía `true` ante un conjunto vacío, ese nombre empataba con la
 * primera entidad contra la que se lo comparara — y en el sync de áreas se
 * llevó puestas 7 áreas de otra superintendencia.
 */
export function mismoNombreOrganizacion(
  a: string,
  b: string,
  umbral = 0.6,
): boolean {
  const ta = significativas(a);
  const tb = significativas(b);
  if (ta.size === 0 || tb.size === 0) return false;

  const comunes = [...ta].filter((t) => tb.has(t)).length;
  return comunes / Math.min(ta.size, tb.size) >= umbral;
}
