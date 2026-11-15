import * as ExcelJS from 'exceljs';
import type { FilaDePlanilla } from './domain/carga-planilla';

/**
 * Dónde está cada cosa en la planilla de seguimiento (1.02.P06.F41), para
 * escribirla al descargar y leerla al subir.
 *
 * El id del plan y el de cada tarea van en las columnas Q y R, que la
 * plantilla oficial ya trae ocultas y vacías en las filas de tareas. Están
 * pegadas a la tabla: si alguien ordena o filtra las filas, se mueven con
 * ellas. La planilla se ve igual que antes.
 */
export const PLANILLA = {
  hoja: 'Planilla de Seguimiento',
  primeraFila: 12,
  /** Más allá no se buscan tareas: una planilla real no llega ni cerca. */
  ultimaFila: 2000,
  celdaPlan: 'Q10',
  columnaId: 'Q',
  columnaVersion: 'R',
} as const;

/** Un problema de la planilla entera: con él no se aplica ninguna fila. */
export class PlanillaInvalida extends Error {}

const crudo = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    return undefined;
  }
  return v;
};

/** El texto de la celda tal cual (con sus saltos de línea), sin bordes. */
const texto = (v: ExcelJS.CellValue): string | undefined => {
  const c = crudo(v);
  if (c === null || c === undefined) return undefined;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const t = String(c as string | number | boolean).trim();
  return t === '' ? undefined : t;
};

const entero = (v: ExcelJS.CellValue): number | undefined => {
  const t = texto(v);
  return t !== undefined && /^\d+$/.test(t) ? Number(t) : undefined;
};

/** Una fecha de Excel, o un texto `dd/mm/aaaa`. `null` si no se entiende. */
const fecha = (v: ExcelJS.CellValue): Date | undefined | null => {
  const c = crudo(v);
  if (c === null || c === undefined || c === '') return undefined;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(
    String(c as string).trim(),
  );
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
};

/** Las columnas de la tarea, de B a N (O y P son fórmulas). */
const COLUMNAS_CON_DATOS = 'BCDEFGHIJKLMN'.split('');

/**
 * Lee la planilla subida. Lanza `PlanillaInvalida` si no es una planilla de
 * seguimiento descargada del sistema.
 */
export async function leerPlanillaDeSeguimiento(
  contenido: Buffer,
): Promise<{ planId?: string; filas: FilaDePlanilla[] }> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(
      contenido as unknown as Parameters<typeof libro.xlsx.load>[0],
    );
  } catch {
    throw new PlanillaInvalida(
      'El archivo no es un Excel (.xlsx) válido. Suba la planilla descargada del plan.',
    );
  }

  const hoja = libro.getWorksheet(PLANILLA.hoja);
  if (!hoja) {
    throw new PlanillaInvalida(
      `El archivo no tiene la hoja «${PLANILLA.hoja}»: no es la planilla de seguimiento (1.02.P06.F41).`,
    );
  }

  const filas: FilaDePlanilla[] = [];
  const ultima = Math.min(hoja.rowCount, PLANILLA.ultimaFila);
  for (let n = PLANILLA.primeraFila; n <= ultima; n++) {
    const fila = hoja.getRow(n);
    const celda = (columna: string) => fila.getCell(columna).value;
    const tareaId = texto(celda(PLANILLA.columnaId));
    const tieneDatos = COLUMNAS_CON_DATOS.some(
      (c) => texto(celda(c)) !== undefined,
    );
    if (!tareaId && !tieneDatos) continue;

    filas.push({
      fila: n,
      item: entero(celda('A')),
      tareaId,
      version: entero(celda(PLANILLA.columnaVersion)),
      tieneDatos,
      fechaHallazgo: fecha(celda('B')),
      responsableObservacion: texto(celda('C')),
      empresa: texto(celda('D')),
      lugarFisico: texto(celda('E')),
      actividad: texto(celda('F')),
      familiaPeligro: texto(celda('G')),
      descripcionObservacion: texto(celda('H')),
      accionPropuesta: texto(celda('I')),
      responsableAreaCierre: texto(celda('J')),
      fechaCumplimientoAcordada: fecha(celda('M')),
      fechaCumplimientoEfectiva: fecha(celda('N')),
    });
  }

  return { planId: texto(hoja.getCell(PLANILLA.celdaPlan).value), filas };
}
