/**
 * En qué situación está cada bomba: cuándo toca el próximo monitoreo. Es lo
 * que Confiabilidad necesita ver de un vistazo, y hoy vive en una celda oculta
 * de cada Excel.
 *
 * **Próximo monitoreo**: el último reporte emitido + la frecuencia de su OT
 * modelo (28, 56 o 70 días). Es cuándo hay que volver a medir.
 *
 * Hubo una segunda fecha, la tentativa de intervención (fecha + (TMEF − horas)
 * / 24). Se quitó con el TMEF, a pedido de Confiabilidad (2026-11-18).
 */

/** Días de anticipación con que una fecha pasa a «próxima». */
export const AVISO_MONITOREO_DIAS = 7;

export type Alerta = 'vencida' | 'proxima' | 'al_dia' | 'sin_datos';

export interface UltimoReporte {
  id: string;
  codigo_interno?: string;
  fecha: Date;
  resultado?: string;
}

export interface SituacionBomba {
  ultimo_reporte?: UltimoReporte;
  proximo_monitoreo?: Date;
  dias_para_monitoreo?: number;
  alerta_monitoreo: Alerta;
  /** Para ordenar la lista por urgencia (hoy es la del monitoreo). */
  alerta: Alerta;
}

const MS_POR_DIA = 86_400_000;
const ORDEN: Alerta[] = ['vencida', 'proxima', 'al_dia', 'sin_datos'];

/** Días enteros de `desde` a `hasta`, contando por fecha (UTC), no por horas. */
export function diasEntre(desde: Date, hasta: Date): number {
  const dia = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(hasta) - dia(desde)) / MS_POR_DIA);
}

function alertaDe(dias: number | undefined, aviso: number): Alerta {
  if (dias === undefined) return 'sin_datos';
  if (dias < 0) return 'vencida';
  if (dias <= aviso) return 'proxima';
  return 'al_dia';
}

export function situacionDeBomba(
  ultimo: UltimoReporte | undefined,
  frecuenciaDias: number | undefined,
  hoy: Date,
): SituacionBomba {
  const proximo =
    ultimo && frecuenciaDias
      ? new Date(ultimo.fecha.getTime() + frecuenciaDias * MS_POR_DIA)
      : undefined;
  const diasMonitoreo = proximo ? diasEntre(hoy, proximo) : undefined;
  const alerta = alertaDe(diasMonitoreo, AVISO_MONITOREO_DIAS);
  return {
    ultimo_reporte: ultimo,
    proximo_monitoreo: proximo,
    dias_para_monitoreo: diasMonitoreo,
    alerta_monitoreo: alerta,
    alerta,
  };
}

/** Para ordenar: lo vencido primero, después lo próximo, y dentro de cada grupo lo más cercano. */
export function compararUrgencia(a: SituacionBomba, b: SituacionBomba): number {
  const porAlerta = ORDEN.indexOf(a.alerta) - ORDEN.indexOf(b.alerta);
  if (porAlerta !== 0) return porAlerta;
  const cercania = (s: SituacionBomba) => s.dias_para_monitoreo ?? Infinity;
  // Dos sin fecha dan Infinity − Infinity = NaN: empatan.
  const diferencia = cercania(a) - cercania(b);
  return Number.isNaN(diferencia) ? 0 : diferencia;
}
