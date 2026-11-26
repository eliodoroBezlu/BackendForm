/**
 * La medición de espesores por ultrasonido (p. ej. COULT-0482 del muestreador
 * 250SA225), sin base ni framework.
 *
 * Cada equipo se mide con su propia grilla: piezas → zonas (los «lados») →
 * anillos (filas) × puntos A, B, C… (columnas). La grilla es la **plantilla de
 * medición** del tag y la técnica; el reporte guarda una copia al crearse y
 * los valores que cargó el analista. El espesor mínimo de cada zona lo
 * calcula el sistema, no una fórmula del Excel (que se rompía: `#REF!`).
 */

export const MAX_PIEZAS_MEDICION = 30;
export const MAX_ZONAS_POR_PIEZA = 8;
export const MAX_ANILLOS = 12;
/** A…L. El Excel llega hasta H; se deja margen. */
export const MAX_PUNTOS = 12;
/** Un espesor en mm por encima de esto es un error de tipeo, no una medida. */
export const ESPESOR_MAXIMO_MM = 500;

export interface ZonaDeMedicion {
  /** «Lado Oeste». Vacío cuando la pieza tiene una sola zona. */
  nombre: string;
  anillos: number;
  puntos: number;
}

export interface PiezaDeMedicion {
  /** «1», «Cuello», «Dardo LV250033». */
  nombre: string;
  zonas: ZonaDeMedicion[];
  espesor_nominal_mm?: number;
  /** Por debajo de esto el valor se marca en rojo. */
  espesor_alerta_mm?: number;
}

export interface EstructuraDeMedicion {
  /** «Medición de espesores en el muestreador 250SA225 L2». */
  titulo: string;
  piezas: PiezaDeMedicion[];
}

/** `valores[pieza][zona][anillo][punto]`; `null` es «no se midió». */
export type ValoresDeMedicion = (number | null)[][][][];

export interface MinimoDeZona {
  pieza: string;
  zona: string;
  minimo?: number;
}

/** 0 → A, 1 → B… */
export const letraDePunto = (i: number): string => String.fromCharCode(65 + i);

const entero = (n: unknown, min: number, max: number): boolean =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

const positivo = (n: unknown): boolean =>
  n === undefined ||
  (typeof n === 'number' &&
    Number.isFinite(n) &&
    n > 0 &&
    n <= ESPESOR_MAXIMO_MM);

const clave = (t: string): string =>
  t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

/** Lo que está mal en una grilla, en palabras del usuario. Vacío: sirve. */
export function erroresDeEstructura(e: EstructuraDeMedicion): string[] {
  const errores: string[] = [];
  if (!e.titulo?.trim()) errores.push('Falta el título de la medición');
  if (!Array.isArray(e.piezas) || e.piezas.length === 0) {
    errores.push('La medición necesita al menos una pieza');
    return errores;
  }
  if (e.piezas.length > MAX_PIEZAS_MEDICION) {
    errores.push(`Como máximo ${MAX_PIEZAS_MEDICION} piezas`);
  }

  const piezas = new Set<string>();
  e.piezas.forEach((p, i) => {
    const nombre = p.nombre?.trim() ?? '';
    const cual = nombre ? `La pieza «${nombre}»` : `La pieza ${i + 1}`;
    if (!nombre) errores.push(`${cual} no tiene nombre`);
    else if (piezas.has(clave(nombre))) errores.push(`${cual} está repetida`);
    piezas.add(clave(nombre));

    if (!positivo(p.espesor_nominal_mm)) {
      errores.push(`${cual}: el espesor nominal no es válido`);
    }
    if (!positivo(p.espesor_alerta_mm)) {
      errores.push(`${cual}: el espesor de alerta no es válido`);
    }

    if (!Array.isArray(p.zonas) || p.zonas.length === 0) {
      errores.push(`${cual} no tiene zonas`);
      return;
    }
    if (p.zonas.length > MAX_ZONAS_POR_PIEZA) {
      errores.push(`${cual}: como máximo ${MAX_ZONAS_POR_PIEZA} zonas`);
    }
    const zonas = new Set<string>();
    p.zonas.forEach((z, j) => {
      const zona = z.nombre?.trim() ?? '';
      const cualZona = zona ? `la zona «${zona}»` : `la zona ${j + 1}`;
      if (p.zonas.length > 1 && !zona) {
        errores.push(`${cual}: ${cualZona} no tiene nombre`);
      } else if (zona && zonas.has(clave(zona))) {
        errores.push(`${cual}: ${cualZona} está repetida`);
      }
      zonas.add(clave(zona));
      if (!entero(z.anillos, 1, MAX_ANILLOS)) {
        errores.push(`${cual}, ${cualZona}: de 1 a ${MAX_ANILLOS} anillos`);
      }
      if (!entero(z.puntos, 1, MAX_PUNTOS)) {
        errores.push(`${cual}, ${cualZona}: de 1 a ${MAX_PUNTOS} puntos`);
      }
    });
  });
  return errores;
}

/** La grilla limpia: nombres sin espacios de más y sin claves vacías. */
export function normalizarEstructura(
  e: EstructuraDeMedicion,
): EstructuraDeMedicion {
  return {
    titulo: e.titulo.trim(),
    piezas: e.piezas.map((p) => ({
      nombre: p.nombre.trim(),
      zonas: p.zonas.map((z) => ({
        nombre: z.nombre?.trim() ?? '',
        anillos: z.anillos,
        puntos: z.puntos,
      })),
      ...(p.espesor_nominal_mm !== undefined && {
        espesor_nominal_mm: p.espesor_nominal_mm,
      }),
      ...(p.espesor_alerta_mm !== undefined && {
        espesor_alerta_mm: p.espesor_alerta_mm,
      }),
    })),
  };
}

/** La grilla sin medir: todo `null`. */
export function valoresVacios(e: EstructuraDeMedicion): ValoresDeMedicion {
  return e.piezas.map((p) =>
    p.zonas.map((z) =>
      Array.from({ length: z.anillos }, () =>
        Array.from({ length: z.puntos }, () => null),
      ),
    ),
  );
}

/**
 * Lo que está mal en los valores recibidos. La forma tiene que calzar con la
 * grilla exacta: un valor en la celda equivocada es peor que ninguno.
 */
export function erroresDeValores(
  e: EstructuraDeMedicion,
  valores: unknown,
): string[] {
  const forma = 'Las mediciones no calzan con la grilla de la plantilla';
  if (!Array.isArray(valores) || valores.length !== e.piezas.length) {
    return [forma];
  }
  const errores: string[] = [];
  for (const [i, p] of e.piezas.entries()) {
    const zonas: unknown = valores[i];
    if (!Array.isArray(zonas) || zonas.length !== p.zonas.length) {
      return [forma];
    }
    for (const [j, z] of p.zonas.entries()) {
      const anillos: unknown = zonas[j];
      if (!Array.isArray(anillos) || anillos.length !== z.anillos) {
        return [forma];
      }
      for (const [k, fila] of (anillos as unknown[]).entries()) {
        if (!Array.isArray(fila) || fila.length !== z.puntos) return [forma];
        (fila as unknown[]).forEach((v, n) => {
          if (v === null) return;
          if (!positivo(v)) {
            const zona = z.nombre ? `, ${z.nombre}` : '';
            errores.push(
              `Pieza ${p.nombre}${zona}, anillo ${k + 1}, punto ${letraDePunto(n)}: el espesor no es válido`,
            );
          }
        });
      }
    }
  }
  return errores;
}

const medidos = (filas: (number | null)[][]): number[] =>
  filas.flat().filter((v): v is number => typeof v === 'number');

/** El espesor mínimo de cada zona, en el orden de la grilla. */
export function minimosPorZona(
  e: EstructuraDeMedicion,
  valores: ValoresDeMedicion,
): MinimoDeZona[] {
  return e.piezas.flatMap((p, i) =>
    p.zonas.map((z, j) => {
      const numeros = medidos(valores[i]?.[j] ?? []);
      return {
        pieza: p.nombre,
        zona: z.nombre,
        minimo: numeros.length ? Math.min(...numeros) : undefined,
      };
    }),
  );
}

export const hayMediciones = (valores: ValoresDeMedicion): boolean =>
  valores.some((zonas) => zonas.some((filas) => medidos(filas).length > 0));

/** ¿Un valor de esta pieza está por debajo de su espesor de alerta? */
export const bajoAlerta = (p: PiezaDeMedicion, valor?: number): boolean =>
  valor !== undefined &&
  p.espesor_alerta_mm !== undefined &&
  valor < p.espesor_alerta_mm;

/**
 * El mínimo de la medición anterior para cada zona de esta grilla, buscado
 * por nombre de pieza y zona: si la grilla cambió entre reportes, lo que ya
 * no se llama igual simplemente no tiene anterior.
 */
export function minimosAnteriores(
  e: EstructuraDeMedicion,
  anteriores: MinimoDeZona[],
): (number | undefined)[][] {
  const porClave = new Map(
    anteriores.map((m) => [`${clave(m.pieza)}|${clave(m.zona)}`, m.minimo]),
  );
  return e.piezas.map((p) =>
    p.zonas.map((z) => porClave.get(`${clave(p.nombre)}|${clave(z.nombre)}`)),
  );
}
