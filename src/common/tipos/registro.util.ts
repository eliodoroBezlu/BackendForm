/**
 * Utilidades para recorrer e indexar objetos usados como mapas de consulta.
 *
 * El patrón aparece por todo el generador de Excel: un objeto literal que
 * relaciona una clave de negocio con una fila o columna de la hoja, recorrido
 * después con `Object.entries`. El problema es que `Object.entries` declara las
 * claves como `string` —pierde qué claves son—, así que usar el resultado para
 * indexar el objeto de datos produce un `any` implícito.
 *
 * `entradasDe` conserva el tipo de las claves. Es el mismo `Object.entries` en
 * tiempo de ejecución; solo cambia lo que TypeScript sabe de él.
 */

/** Las claves de `T` que son cadenas (descarta símbolos y números). */
export type ClaveDe<T> = Extract<keyof T, string>;

/**
 * `Object.entries` conservando el tipo de las claves.
 *
 * ```ts
 * for (const [sistema, fila] of entradasDe(filasSistemasPasivos)) {
 *   sistemasPasivos[sistema]; // ✔ sistema está tipado, no es string suelto
 * }
 * ```
 */
export const entradasDe = <T extends object>(
  objeto: T,
): [ClaveDe<T>, T[ClaveDe<T>]][] =>
  Object.entries(objeto) as [ClaveDe<T>, T[ClaveDe<T>]][];

/** `Object.keys` conservando el tipo de las claves. */
export const clavesDe = <T extends object>(objeto: T): ClaveDe<T>[] =>
  Object.keys(objeto) as ClaveDe<T>[];

/**
 * Busca una clave que llega en tiempo de ejecución dentro de un objeto usado
 * como mapa, conservando el tipo del valor.
 *
 * Se usa cuando el mapa tiene entradas de formas distintas —donde `Record` no
 * sirve— y la clave se construye dinámicamente. El resultado incluye
 * `undefined` porque la clave puede no existir: es lo que de verdad ocurre en
 * ejecución, y obliga a comprobarlo antes de usar el valor.
 */
export const buscarEn = <T extends object>(
  objeto: T,
  clave: string,
): T[ClaveDe<T>] | undefined =>
  (objeto as Record<string, T[ClaveDe<T>] | undefined>)[clave];
