import * as ExcelJS from 'exceljs';
import { FORMA_TAG, PIEZAS_BOMBA, PiezaBomba } from '../domain/bomba';
import {
  normalizarValor,
  TipoCatalogoMonitoreo,
} from '../domain/catalogos-iniciales';

/**
 * Lee la «Planilla de carga - bombas.xlsx» que llena Confiabilidad.
 *
 * Solo lee y revisa: no toca la base. Las columnas se buscan **por su
 * cabecera**, no por posición, para que agregar o mover una columna en la
 * planilla no corra los datos de lugar.
 *
 * Un problema `grave` impide aplicar la carga (un TAG mal escrito, un número
 * que no es número, una pieza que no existe); un aviso se informa y se sigue.
 */

export interface BombaLeida {
  fila: number;
  tag: string;
  otModelo?: string;
  frecuenciaDias?: number;
  fabricante?: string;
  modelo?: string;
  servicio?: string;
  tmefHrs?: number;
  tagPi?: string;
  pares: string[];
  ubicacion?: string;
}

export interface ComponenteLeido {
  fila: number;
  tag: string;
  pieza: PiezaBomba;
  proveedor?: string;
  material?: string;
  durezaHb?: number;
  condicionInicial?: string;
  espesorNominalMm?: number;
  espesorPrecaucionMm?: number;
  fechaInstalacion?: Date;
}

export interface IntervencionLeida {
  fila: number;
  tag: string;
  fecha: Date;
  tipo?: string;
  ot?: string;
  horas?: number;
  piezas: PiezaBomba[];
  nota?: string;
}

export interface ProblemaDePlanilla {
  hoja: string;
  fila?: number;
  mensaje: string;
  grave: boolean;
}

export interface PlanillaLeida {
  bombas: BombaLeida[];
  componentes: ComponenteLeido[];
  intervenciones: IntervencionLeida[];
  /** Los valores de la hoja «Listas», para agregarlos a los catálogos. */
  listas: Partial<Record<TipoCatalogoMonitoreo, string[]>>;
  problemas: ProblemaDePlanilla[];
}

const HOJA = {
  bombas: 'Bombas',
  componentes: 'Componentes',
  intervenciones: 'Intervenciones',
  listas: 'Listas',
} as const;

/** Cabecera de la hoja «Listas» → catálogo. */
const LISTA_A_CATALOGO: Record<string, TipoCatalogoMonitoreo> = {
  FABRICANTE: TipoCatalogoMonitoreo.FABRICANTE,
  PROVEEDOR: TipoCatalogoMonitoreo.PROVEEDOR,
  'CONDICION INICIAL': TipoCatalogoMonitoreo.CONDICION_INICIAL,
  'TIPO DE INTERVENCION': TipoCatalogoMonitoreo.TIPO_INTERVENCION,
  INSTRUMENTO: TipoCatalogoMonitoreo.INSTRUMENTO,
  'PUNTO DE TEMPERATURA DE REFERENCIA': TipoCatalogoMonitoreo.PUNTO_REFERENCIA,
};

// ─── Valores de celda ────────────────────────────────────────────────────────

const crudo = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    return undefined;
  }
  return v;
};

export function texto(v: ExcelJS.CellValue): string | undefined {
  const c = crudo(v);
  if (c === null || c === undefined) return undefined;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const t = String(c as string | number | boolean)
    .replace(/\s+/g, ' ')
    .trim();
  return t === '' ? undefined : t;
}

/** Un número, también escrito con coma decimal («2,5»). `null` si hay algo que no es número. */
export function numero(v: ExcelJS.CellValue): number | undefined | null {
  const c = crudo(v);
  if (c === null || c === undefined || c === '') return undefined;
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const t = String(c as string)
    .trim()
    .replace(',', '.');
  if (t === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** Una fecha de Excel, o un texto `dd/mm/aaaa`. `null` si no se entiende. */
export function fecha(v: ExcelJS.CellValue): Date | undefined | null {
  const c = crudo(v);
  if (c === null || c === undefined || c === '') return undefined;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(
    String(c as string).trim(),
  );
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

const piezaDe = (t: string): PiezaBomba | undefined =>
  PIEZAS_BOMBA.find((p) => normalizarValor(p) === normalizarValor(t));

// ─── Lectura por cabeceras ───────────────────────────────────────────────────

interface Hoja {
  nombre: string;
  filas: { numero: number; celda: (cabecera: string) => ExcelJS.CellValue }[];
}

function leerHoja(ws: ExcelJS.Worksheet): Hoja {
  const columnas = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => {
    const t = texto(c.value);
    if (t) columnas.set(normalizarValor(t), col);
  });
  const filas: Hoja['filas'] = [];
  ws.eachRow((row, numeroFila) => {
    if (numeroFila === 1) return;
    filas.push({
      numero: numeroFila,
      celda: (cabecera) => {
        const col = columnas.get(normalizarValor(cabecera));
        return col === undefined ? null : row.getCell(col).value;
      },
    });
  });
  return { nombre: ws.name, filas };
}

// ─── La planilla ─────────────────────────────────────────────────────────────

export async function leerPlanillaDeCarga(
  archivo: Buffer,
): Promise<PlanillaLeida> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(archivo as unknown as ArrayBuffer);
  const problemas: ProblemaDePlanilla[] = [];
  const grave = (hoja: string, fila: number | undefined, mensaje: string) =>
    problemas.push({ hoja, fila, mensaje, grave: true });
  const aviso = (hoja: string, fila: number | undefined, mensaje: string) =>
    problemas.push({ hoja, fila, mensaje, grave: false });

  const hojaDe = (nombre: string): Hoja | undefined => {
    const ws = wb.getWorksheet(nombre);
    if (!ws) {
      grave(nombre, undefined, `Falta la hoja «${nombre}»`);
      return undefined;
    }
    return leerHoja(ws);
  };

  const listas = leerListas(wb.getWorksheet(HOJA.listas));
  // Sin la hoja o sin esa columna no hay contra qué comparar: avisar de cada
  // valor solo taparía los avisos que importan.
  const enLista = (tipo: TipoCatalogoMonitoreo, valor: string) =>
    listas[tipo] === undefined ||
    listas[tipo].some((v) => normalizarValor(v) === normalizarValor(valor));

  /** Un número de la fila; si no es número, problema grave. */
  const numeroDe = (h: Hoja, f: Hoja['filas'][number], cabecera: string) => {
    const n = numero(f.celda(cabecera));
    if (n === null) grave(h.nombre, f.numero, `«${cabecera}» no es un número`);
    return n ?? undefined;
  };
  const fechaDe = (h: Hoja, f: Hoja['filas'][number], cabecera: string) => {
    const d = fecha(f.celda(cabecera));
    if (d === null)
      grave(h.nombre, f.numero, `«${cabecera}» no es una fecha (dd/mm/aaaa)`);
    return d ?? undefined;
  };

  // Bombas
  const bombas: BombaLeida[] = [];
  const hojaBombas = hojaDe(HOJA.bombas);
  for (const f of hojaBombas?.filas ?? []) {
    const h = hojaBombas!;
    const tag = texto(f.celda('TAG'))?.toUpperCase();
    if (!tag) continue;
    if (!FORMA_TAG.test(tag)) {
      grave(
        h.nombre,
        f.numero,
        `TAG «${tag}» no tiene la forma de un TAG de planta (p. ej. 230PP013)`,
      );
      continue;
    }
    if (bombas.some((b) => b.tag === tag)) {
      grave(h.nombre, f.numero, `TAG «${tag}» repetido`);
      continue;
    }
    const pares = (texto(f.celda('Bombas pares')) ?? '')
      .split(/[,;]/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    pares
      .filter((p) => !FORMA_TAG.test(p))
      .forEach((p) =>
        aviso(h.nombre, f.numero, `Bomba par «${p}» no parece un TAG`),
      );
    const fabricante = texto(f.celda('Fabricante'));
    if (fabricante && !enLista(TipoCatalogoMonitoreo.FABRICANTE, fabricante)) {
      aviso(
        h.nombre,
        f.numero,
        `Fabricante «${fabricante}» no está en la hoja Listas`,
      );
    }
    bombas.push({
      fila: f.numero,
      tag,
      otModelo: texto(f.celda('OT modelo')),
      frecuenciaDias: numeroDe(h, f, 'Frecuencia (días)'),
      fabricante,
      modelo: texto(f.celda('Modelo')),
      servicio: texto(f.celda('Servicio / proceso')),
      tmefHrs: numeroDe(h, f, 'TMEF (hrs)'),
      tagPi: texto(f.celda('Tag de horas en PI')),
      pares,
      ubicacion: texto(f.celda('Ubicación')),
    });
  }
  const existe = (tag: string) => bombas.some((b) => b.tag === tag);

  // Componentes
  const componentes: ComponenteLeido[] = [];
  const hojaComp = hojaDe(HOJA.componentes);
  for (const f of hojaComp?.filas ?? []) {
    const h = hojaComp!;
    const tag = texto(f.celda('TAG'))?.toUpperCase();
    const textoPieza = texto(f.celda('Pieza'));
    if (!tag || !textoPieza) continue;
    const datos = [
      'Proveedor',
      'Material / código',
      'Dureza (HB)',
      'Condición inicial',
      'Espesor nominal (mm)',
      'Espesor de precaución (mm)',
      'Fecha de instalación',
    ];
    // Las 84 filas vienen con TAG y pieza escritos: una fila sin datos es una pieza sin cargar.
    if (datos.every((c) => texto(f.celda(c)) === undefined)) continue;
    if (!existe(tag)) {
      grave(h.nombre, f.numero, `TAG «${tag}» no está en la hoja Bombas`);
      continue;
    }
    const pieza = piezaDe(textoPieza);
    if (!pieza) {
      grave(
        h.nombre,
        f.numero,
        `Pieza «${textoPieza}» no es una de ${PIEZAS_BOMBA.join(', ')}`,
      );
      continue;
    }
    if (componentes.some((c) => c.tag === tag && c.pieza === pieza)) {
      grave(h.nombre, f.numero, `${tag}: la pieza «${pieza}» está dos veces`);
      continue;
    }
    const proveedor = texto(f.celda('Proveedor'));
    if (proveedor && !enLista(TipoCatalogoMonitoreo.PROVEEDOR, proveedor)) {
      aviso(
        h.nombre,
        f.numero,
        `Proveedor «${proveedor}» no está en la hoja Listas`,
      );
    }
    const condicion = texto(f.celda('Condición inicial'));
    if (
      condicion &&
      !enLista(TipoCatalogoMonitoreo.CONDICION_INICIAL, condicion)
    ) {
      aviso(
        h.nombre,
        f.numero,
        `Condición «${condicion}» no está en la hoja Listas`,
      );
    }
    componentes.push({
      fila: f.numero,
      tag,
      pieza,
      proveedor,
      material: texto(f.celda('Material / código')),
      durezaHb: numeroDe(h, f, 'Dureza (HB)'),
      condicionInicial: condicion,
      espesorNominalMm: numeroDe(h, f, 'Espesor nominal (mm)'),
      espesorPrecaucionMm: numeroDe(h, f, 'Espesor de precaución (mm)'),
      fechaInstalacion: fechaDe(h, f, 'Fecha de instalación'),
    });
  }

  // Intervenciones
  const intervenciones: IntervencionLeida[] = [];
  const hojaInt = hojaDe(HOJA.intervenciones);
  for (const f of hojaInt?.filas ?? []) {
    const h = hojaInt!;
    const tag = texto(f.celda('TAG'))?.toUpperCase();
    if (!tag) continue;
    if (!existe(tag)) {
      grave(h.nombre, f.numero, `TAG «${tag}» no está en la hoja Bombas`);
      continue;
    }
    const fechaIntervencion = fechaDe(h, f, 'Fecha');
    if (!fechaIntervencion) {
      if (fecha(f.celda('Fecha')) === undefined)
        grave(h.nombre, f.numero, `${tag}: la intervención no tiene fecha`);
      continue;
    }
    if (
      intervenciones.some(
        (i) =>
          i.tag === tag && i.fecha.getTime() === fechaIntervencion.getTime(),
      )
    ) {
      grave(h.nombre, f.numero, `${tag}: hay dos intervenciones el mismo día`);
      continue;
    }
    const tipo = texto(f.celda('Tipo de intervención'));
    if (tipo && !enLista(TipoCatalogoMonitoreo.TIPO_INTERVENCION, tipo)) {
      aviso(h.nombre, f.numero, `Tipo «${tipo}» no está en la hoja Listas`);
    }
    const piezas: PiezaBomba[] = [];
    for (const t of (texto(f.celda('Piezas cambiadas')) ?? '')
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean)) {
      const p = piezaDe(t);
      if (p) piezas.push(p);
      else
        aviso(
          h.nombre,
          f.numero,
          `Pieza cambiada «${t}» no es una de ${PIEZAS_BOMBA.join(', ')}`,
        );
    }
    intervenciones.push({
      fila: f.numero,
      tag,
      fecha: fechaIntervencion,
      tipo,
      ot: texto(f.celda('N° OT')),
      horas: numeroDe(h, f, 'Horas al intervenir'),
      piezas,
      nota: texto(f.celda('Fuente / nota')),
    });
  }

  if (bombas.length === 0 && hojaBombas)
    grave(HOJA.bombas, undefined, 'La hoja Bombas no tiene ninguna bomba');
  return { bombas, componentes, intervenciones, listas, problemas };
}

function leerListas(
  ws: ExcelJS.Worksheet | undefined,
): PlanillaLeida['listas'] {
  const listas: PlanillaLeida['listas'] = {};
  if (!ws) return listas;
  ws.getRow(1).eachCell((c, col) => {
    const tipo = LISTA_A_CATALOGO[normalizarValor(texto(c.value) ?? '')];
    if (!tipo) return;
    const valores: string[] = [];
    for (let fila = 2; fila <= ws.rowCount; fila++) {
      const v = texto(ws.getRow(fila).getCell(col).value);
      if (v) valores.push(v);
    }
    listas[tipo] = valores;
  });
  return listas;
}
