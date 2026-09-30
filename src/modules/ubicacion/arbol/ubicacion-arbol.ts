import { normalizarNombre } from '../../../common/utils/nombres-organizacion.util';

/**
 * Reglas del árbol de ubicaciones, sin Mongo.
 * ────────────────────────────────────────────
 *
 * Una ubicación guarda su `padre` —la fuente de verdad— y además tres campos
 * derivados que permiten consultar sin recorrer el árbol:
 *
 * - `ancestros`: ids de la raíz al padre. «Todo lo que cuelga de X» es
 *   `find({ ancestros: X })`, sin recursión.
 * - `ruta`: `"Taller de flotación › Bodega 1 › Estante A"`, lo que se muestra.
 * - `nivel`: 0 para una raíz.
 *
 * Los derivados se desincronizan si alguien cambia `padre` o `nombre` sin
 * recalcularlos. Por eso viven aquí, en funciones puras que el servicio
 * aplica en cada escritura, y no repartidos por el servicio — se prueban sin
 * base de datos, y el servicio queda para la entrada/salida.
 */

/** Niveles permitidos en total: raíz + 6 por debajo. */
export const PROFUNDIDAD_MAXIMA = 7;

/** El `nivel` más hondo permitido (la raíz es 0). */
export const NIVEL_MAXIMO = PROFUNDIDAD_MAXIMA - 1;

/**
 * Separador de tramos en la columna «Ubicación» del Excel de importación.
 *
 * Es `>` y no `/` porque `/` es plausible dentro de un nombre («Taller E/I»),
 * y ningún nombre existente contiene `>`. Para que siga siendo así, un nombre
 * con `>` se rechaza al crear o renombrar.
 */
export const SEPARADOR_IMPORTACION = '>';

/** Separador de la `ruta` que se muestra en pantalla, Excel y autollenado. */
export const SEPARADOR_RUTA = ' › ';

/** Lo mínimo de un nodo que hace falta para colgarle un hijo. */
export interface NodoPadre {
  _id: string;
  ancestros: string[];
  ruta: string;
  nivel: number;
}

export interface Derivados {
  padre: string | null;
  ancestros: string[];
  ruta: string;
  nivel: number;
  nombreNormalizado: string;
}

/** Nodo tal como lo necesita el recálculo de un subárbol. */
export interface NodoPlano {
  _id: string;
  nombre: string;
  padre: string | null;
}

/** Mayúsculas, sin tildes, espacios colapsados: la clave de unicidad. */
export const normalizarUbicacion = (nombre: string): string =>
  normalizarNombre(nombre);

/** Recorta y colapsa espacios; conserva mayúsculas y tildes tal como vinieron. */
export const limpiarNombre = (nombre: string): string =>
  nombre.replace(/\s+/g, ' ').trim();

/** Los campos derivados de un nodo, a partir de su nombre y su padre. */
export function derivadosDe(
  nombre: string,
  padre: NodoPadre | null,
): Derivados {
  if (!padre) {
    return {
      padre: null,
      ancestros: [],
      ruta: nombre,
      nivel: 0,
      nombreNormalizado: normalizarUbicacion(nombre),
    };
  }
  return {
    padre: padre._id,
    ancestros: [...padre.ancestros, padre._id],
    ruta: `${padre.ruta}${SEPARADOR_RUTA}${nombre}`,
    nivel: padre.nivel + 1,
    nombreNormalizado: normalizarUbicacion(nombre),
  };
}

/**
 * Parte el texto de la celda del Excel en tramos. Los tramos vacíos
 * (`"Taller > > Estante"`, `"> Bodega"`) se descartan.
 */
export function partirRuta(texto: string): string[] {
  return texto
    .split(SEPARADOR_IMPORTACION)
    .map(limpiarNombre)
    .filter((tramo) => tramo.length > 0);
}

/**
 * `true` si colgar `nodoId` de `candidatoPadre` cerraría un ciclo: el
 * candidato es el propio nodo o uno de sus descendientes.
 */
export function formariaCiclo(
  nodoId: string,
  candidatoPadre: NodoPadre,
): boolean {
  return (
    candidatoPadre._id === nodoId || candidatoPadre.ancestros.includes(nodoId)
  );
}

/**
 * Cuántos niveles hay por debajo de `raizId` (0 si no tiene hijos). Sirve
 * para saber si un subárbol entero cabe bajo un padre nuevo sin pasar de
 * {@link NIVEL_MAXIMO}.
 */
export function alturaSubarbol(raizId: string, descendientes: NodoPlano[]) {
  const hijos = agruparPorPadre(descendientes);
  const medir = (id: string): number => {
    const propios = hijos.get(id) ?? [];
    return propios.length === 0
      ? 0
      : 1 + Math.max(...propios.map((h) => medir(h._id)));
  };
  return medir(raizId);
}

/**
 * Los derivados de todos los descendientes de `raiz`, recalculados a partir
 * de los derivados (ya nuevos) de la raíz. Se usa al mover o renombrar: los
 * dos cambian la `ruta` de todo lo que cuelga.
 *
 * `descendientes` es lo que devuelve `find({ ancestros: raiz._id })` —plano,
 * en cualquier orden—; el árbol se reconstruye desde `padre`.
 */
export function recalcularDescendientes(
  raiz: NodoPadre,
  descendientes: NodoPlano[],
): Array<NodoPadre & { padre: string }> {
  const hijos = agruparPorPadre(descendientes);
  const resultado: Array<NodoPadre & { padre: string }> = [];

  const bajar = (padre: NodoPadre) => {
    for (const hijo of hijos.get(padre._id) ?? []) {
      const { ancestros, ruta, nivel } = derivadosDe(hijo.nombre, padre);
      const nuevo = { _id: hijo._id, padre: padre._id, ancestros, ruta, nivel };
      resultado.push(nuevo);
      bajar(nuevo);
    }
  };
  bajar(raiz);
  return resultado;
}

function agruparPorPadre(nodos: NodoPlano[]): Map<string, NodoPlano[]> {
  const hijos = new Map<string, NodoPlano[]>();
  for (const nodo of nodos) {
    if (!nodo.padre) continue;
    const lista = hijos.get(nodo.padre);
    if (lista) lista.push(nodo);
    else hijos.set(nodo.padre, [nodo]);
  }
  return hijos;
}
