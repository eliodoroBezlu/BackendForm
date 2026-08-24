/**
 * Escapa los caracteres especiales de una expresión regular.
 *
 * Se usa antes de meter texto escrito por una persona dentro de un `$regex` de
 * Mongo. Sin esto, lo que el usuario teclea se interpreta **como patrón**:
 *
 * - `.*` deja de buscar y devuelve todo.
 * - `(` produce un error de expresión inválida — el buscador responde 500.
 * - `a{1000000}` es un patrón costoso de evaluar.
 *
 * Con el escape, la búsqueda es literal, que es lo que espera quien escribe un
 * apellido en una caja de texto.
 */
export const escaparRegex = (texto: string): string =>
  texto.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
