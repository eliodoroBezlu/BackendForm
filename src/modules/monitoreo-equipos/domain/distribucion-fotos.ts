/**
 * Cómo se reparten las fotos del reporte en filas. **Copia exacta** de
 * `FormNext/.../features/monitoreo-equipos/domain/distribucionFotos.ts`, que
 * usa la vista previa: la pantalla y el PDF tienen que coincidir. Las dos
 * copias tienen los mismos casos de prueba; si se cambia una, se cambia la
 * otra.
 *
 * Reglas que pidió Confiabilidad:
 *   - un máximo de fotos por fila (configurable; arranca en 3);
 *   - las filas se reparten **parejo**: con 4 fotos y máximo 3 van 2 + 2, no
 *     3 + 1, y si no da exacto las filas largas van primero;
 *   - **todas del mismo tamaño**; una fila con menos fotos se centra;
 *   - una sola foto no ocupa toda la página: se calcula como si hubiera al
 *     menos dos columnas. Una termografía de la FLIR E95 tiene 464 px; a 21,9 cm
 *     de ancho quedaría a 54 ppp, pixelada.
 */

export interface FilaDeFotos {
  /** Índices de las fotos de la fila, en orden. */
  indices: number[];
  /** Desplazamiento desde el borde izquierdo, para centrar la fila. */
  desplazamiento: number;
}

export interface Distribucion {
  /** Ancho de cada foto: el mismo para todas. */
  anchoCelda: number;
  /** Columnas con que se calculó el ancho. */
  columnas: number;
  filas: FilaDeFotos[];
}

/** Cuántas fotos lleva cada fila. */
export function fotosPorFila(
  cantidad: number,
  maximoPorFila: number,
): number[] {
  if (cantidad <= 0) return [];
  const maximo = Math.max(1, Math.floor(maximoPorFila));
  const filas = Math.ceil(cantidad / maximo);
  const base = Math.floor(cantidad / filas);
  const sobrantes = cantidad % filas;
  return Array.from(
    { length: filas },
    (_, i) => base + (i < sobrantes ? 1 : 0),
  );
}

/**
 * La geometría completa: ancho de cada foto y dónde empieza cada fila.
 *
 * @param anchoTotal  ancho disponible (px en pantalla, puntos en el PDF)
 * @param separacion  espacio entre fotos, en la misma unidad
 */
export function distribuirFotos(
  cantidad: number,
  maximoPorFila: number,
  anchoTotal: number,
  separacion: number,
): Distribucion {
  const porFila = fotosPorFila(cantidad, maximoPorFila);
  if (porFila.length === 0) return { anchoCelda: 0, columnas: 0, filas: [] };

  const maximo = Math.max(1, Math.floor(maximoPorFila));
  const columnas = Math.max(porFila[0], Math.min(2, maximo));
  const anchoCelda = (anchoTotal - separacion * (columnas - 1)) / columnas;

  let siguiente = 0;
  const filas = porFila.map((n) => {
    const indices = Array.from({ length: n }, (_, i) => siguiente + i);
    siguiente += n;
    const ocupado = n * anchoCelda + (n - 1) * separacion;
    return { indices, desplazamiento: (anchoTotal - ocupado) / 2 };
  });

  return { anchoCelda, columnas, filas };
}

/** Proporción alto / ancho más apaisada y más vertical que se admite para la caja. */
const PROPORCION_MINIMA = 0.75;
const PROPORCION_MAXIMA = 4 / 3;

/**
 * Alto / ancho de la caja de **todas** las fotos (miden lo mismo).
 *
 * La marca la foto más alta: la FLIR se usa de pie (348 × 464) y una caja
 * apaisada la dejaría a la mitad, mientras que una foto apaisada en una caja
 * alta igual ocupa todo el ancho. Sin medidas, 4:3 apaisada.
 */
export function proporcionDeCaja(
  fotos: { ancho?: number; alto?: number }[],
): number {
  const medidas = fotos
    .filter((f) => f.ancho && f.alto)
    .map((f) => (f.alto as number) / (f.ancho as number));
  if (medidas.length === 0) return PROPORCION_MINIMA;
  return Math.min(PROPORCION_MAXIMA, Math.max(PROPORCION_MINIMA, ...medidas));
}
