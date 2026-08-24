/**
 * Conversión segura de un valor crudo (de Excel o del cliente) a texto.
 *
 * Los normalizadores del dominio reciben `unknown` porque leen celdas de
 * Excel, donde una celda puede traer un string, un número, una fórmula o un
 * objeto `richText`. Hacer `String(valor)` sobre un objeto produce
 * `"[object Object]"`, que **no coincide con ningún catálogo** y por tanto se
 * traduce en un `null` silencioso: el dato se pierde sin error.
 *
 * Por eso solo se aceptan primitivos. Aplanar `richText` u otras formas
 * compuestas es responsabilidad del importador, que sí conoce el formato del
 * archivo — no del dominio, que debe permanecer libre de Excel.
 */
export function textoDeCelda(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

/** `textoDeCelda` + colapso de espacios y recorte. */
export function textoNormalizado(valor: unknown): string | null {
  const texto = textoDeCelda(valor);
  if (texto === null) return null;
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio === '' ? null : limpio;
}

/** Quita tildes y pasa a mayúsculas, para comparar contra catálogos. */
export function paraComparar(valor: unknown): string | null {
  const texto = textoNormalizado(valor);
  return texto === null
    ? null
    : texto.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
