/**
 * Lo que el Excel de escaleras necesita saber de cada tipo: dónde empiezan sus
 * filas.
 */
export interface FilasDeTipo {
  startRow: number;
}

/** La configuración del tipo cuyo texto clave aparece en la opción elegida. */
export function configDeTipo<T>(
  opcion: string,
  mapeo: Record<string, T>,
): T | undefined {
  const texto = opcion.toUpperCase();
  for (const [clave, config] of Object.entries(mapeo)) {
    if (texto.includes(clave.toUpperCase())) return config;
  }
  return undefined;
}

/**
 * Las opciones elegidas en el orden de la plantilla, que es el de las filas
 * del Excel.
 *
 * El formulario guarda las respuestas del primer tipo visible en `sub0`, del
 * segundo en `sub1`, y muestra los tipos en el orden de la plantilla, pero
 * `selectedItems` los tiene en el orden en que se hizo clic. Leer `sub0` como la
 * primera opción clicada cruzaba, por ejemplo, plataforma con tijera.
 */
export function ordenarComoLaPlantilla(
  selecciones: string[],
  mapeo: Record<string, FilasDeTipo>,
): string[] {
  const fila = (opcion: string) =>
    configDeTipo(opcion, mapeo)?.startRow ?? Number.POSITIVE_INFINITY;
  return [...selecciones].sort((a, b) => fila(a) - fila(b));
}
