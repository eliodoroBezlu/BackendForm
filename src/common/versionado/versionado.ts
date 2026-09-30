/**
 * Versionado de plantillas de formulario (control documental ISO 9001).
 * ─────────────────────────────────────────────────────────────────────
 *
 * Cada revisión de una plantilla es **un documento propio**; todas las de un
 * mismo `code` forman una familia. En cada familia hay a lo sumo:
 *
 * - una **vigente**: la única que se ofrece para inspecciones nuevas;
 * - un **borrador**: la revisión siguiente, en preparación;
 * - cualquier cantidad de **obsoletas**: reemplazadas, en solo lectura,
 *   conservadas porque las inspecciones hechas con ellas las siguen usando.
 *
 * Por qué no se edita la plantilla en el lugar: las inspecciones apuntan a su
 * plantilla por `templateId` y se muestran —y se imprimen— con ella. Las de
 * herramientas incluso guardan cada respuesta **por posición**
 * (`section_0.q2`). Cambiar una plantilla ya usada reescribía en silencio las
 * inspecciones hechas con ella. Con revisiones, cada inspección queda atada a
 * la revisión con la que se hizo, que ya no cambia.
 *
 * Ver FormNext/mds/implementation_planConstructoresFormularios.md.
 */

export enum EstadoRevision {
  BORRADOR = 'borrador',
  VIGENTE = 'vigente',
  OBSOLETA = 'obsoleta',
}

/**
 * Filtro de la revisión vigente. Se escribe como «ni borrador ni obsoleta» y
 * no como `{ estadoRevision: 'vigente' }` para que alcance también a las
 * plantillas anteriores al versionado, que no tienen el campo: son vigentes
 * de hecho. Es la misma trampa que el `{ activo: { $ne: false } }` de la
 * baja lógica.
 */
export const FILTRO_VIGENTE = {
  estadoRevision: { $nin: [EstadoRevision.BORRADOR, EstadoRevision.OBSOLETA] },
};

/** Vigentes y borradores: lo que muestra la pantalla de administración. */
export const FILTRO_VIGENTE_O_BORRADOR = {
  estadoRevision: { $ne: EstadoRevision.OBSOLETA },
};

/** El estado de un documento, contando como vigente al que no tiene el campo. */
export const estadoDe = (doc: { estadoRevision?: string | null }) =>
  (doc.estadoRevision as EstadoRevision | undefined) ?? EstadoRevision.VIGENTE;

/**
 * El número de revisión escrito en el texto libre de siempre: «Revisión: 7»,
 * «Rev. 1», «4». Se toma el último número; si no hay ninguno, 1.
 */
export function numeroDesdeTexto(texto: string | undefined | null): number {
  const numeros = String(texto ?? '').match(/\d+/g);
  const n = numeros ? Number(numeros[numeros.length - 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * El texto de la revisión siguiente, respetando el formato de la anterior:
 * «Revisión: 7» → «Revisión: 8», «Rev. 1» → «Rev. 2», «4» → «5». Si el texto
 * no tenía número, «Rev. N».
 */
export function textoDeRevision(
  textoAnterior: string | undefined | null,
  numero: number,
): string {
  const texto = String(textoAnterior ?? '');
  const ultimo = texto.match(/\d+(?!.*\d)/);
  if (!ultimo || ultimo.index === undefined) return `Rev. ${numero}`;
  return (
    texto.slice(0, ultimo.index) +
    String(numero) +
    texto.slice(ultimo.index + ultimo[0].length)
  );
}

/**
 * Campos que **no** se copian al crear una revisión nueva: la identidad del
 * documento, sus fechas, la baja lógica y los datos de publicación de la
 * revisión anterior.
 */
export const CAMPOS_NO_COPIABLES = [
  '_id',
  '__v',
  'createdAt',
  'updatedAt',
  'activo',
  'eliminadaEn',
  'eliminadaPor',
  'motivoCambio',
  'vigenteDesde',
  'obsoletaDesde',
  'publicadaPor',
  'creadaPor',
] as const;
