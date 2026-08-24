/**
 * Traducción entre referencias de celda de Excel («B12») y coordenadas
 * numéricas.
 *
 * Esta función estaba **copiada literalmente en los 15 generadores de Excel**
 * del módulo, byte a byte. Cualquier corrección había que aplicarla quince
 * veces, y basta con olvidar una para que un formato quede distinto del resto.
 *
 * TypeScript puro: sin ExcelJS, sin Nest. Se puede probar con cadenas.
 */

export interface CoordenadasDeCelda {
  /** Número de fila, empezando en 1 (como en la interfaz de Excel). */
  row: number;
  /** Número de columna, empezando en 1: A=1, B=2, … Z=26, AA=27. */
  col: number;
}

const CODIGO_A = 'A'.charCodeAt(0);

/**
 * Convierte «B12» en `{ row: 12, col: 2 }`.
 *
 * La letra se interpreta en base 26 (A=1 … Z=26, AA=27, AB=28), que es como
 * Excel numera sus columnas.
 *
 * ⚠️ Solo reconoce **mayúsculas**, igual que las 15 copias que sustituye: una
 * referencia en minúsculas devuelve `col: 0`. Se conserva ese comportamiento a
 * propósito —todas las referencias del módulo están escritas en mayúsculas— y
 * queda documentado en las pruebas para que sea una decisión visible y no una
 * sorpresa.
 */
export const coordenadasDeCelda = (referencia: string): CoordenadasDeCelda => {
  const letras = referencia.replace(/[^A-Z]/g, '');
  const row = Number.parseInt(referencia.replace(/[^0-9]/g, ''), 10);

  let col = 0;
  for (let i = 0; i < letras.length; i++) {
    col = col * 26 + (letras.charCodeAt(i) - CODIGO_A + 1);
  }

  return { row, col };
};
