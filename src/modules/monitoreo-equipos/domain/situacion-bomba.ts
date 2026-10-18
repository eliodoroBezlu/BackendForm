/**
 * En qué situación está cada bomba: cuándo toca el próximo monitoreo y
 * cuándo la próxima intervención. Es lo que Confiabilidad necesita ver de un
 * vistazo, y hoy vive en una celda oculta de cada Excel.
 *
 * Dos fechas distintas:
 * - **Próximo monitoreo**: el último reporte emitido + la frecuencia de su OT
 *   modelo (28, 56 o 70 días). Es cuándo hay que volver a medir.
 * - **Fecha tentativa**: la del último reporte emitido, fecha + (TMEF − horas)
 *   / 24. Es cuándo la bomba llega a su TMEF y hay que intervenirla.
 */

/** Días de anticipación con que una fecha pasa a «próxima». */
export const AVISO_MONITOREO_DIAS = 7;
/** Una intervención se planifica en JDE con más anticipación que una medición. */
export const AVISO_INTERVENCION_DIAS = 14;

export type Alerta = 'vencida' | 'proxima' | 'al_dia' | 'sin_datos';

export interface UltimoReporte {
  id: string;
  codigo_interno?: string;
  fecha: Date;
  resultado?: string;
  fecha_tentativa?: Date;
  horas_restantes?: number;
}

export interface SituacionBomba {
  ultimo_reporte?: UltimoReporte;
  proximo_monitoreo?: Date;
  dias_para_monitoreo?: number;
  dias_para_intervencion?: number;
  alerta_monitoreo: Alerta;
  alerta_intervencion: Alerta;
  /** La peor de las dos: para ordenar la lista por urgencia. */
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

/** La más urgente de dos alertas. */
export function peorAlerta(a: Alerta, b: Alerta): Alerta {
  return ORDEN[Math.min(ORDEN.indexOf(a), ORDEN.indexOf(b))];
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
  const diasIntervencion = ultimo?.fecha_tentativa
    ? diasEntre(hoy, ultimo.fecha_tentativa)
    : undefined;

  const alerta_monitoreo = alertaDe(diasMonitoreo, AVISO_MONITOREO_DIAS);
  const alerta_intervencion = alertaDe(
    diasIntervencion,
    AVISO_INTERVENCION_DIAS,
  );
  return {
    ultimo_reporte: ultimo,
    proximo_monitoreo: proximo,
    dias_para_monitoreo: diasMonitoreo,
    dias_para_intervencion: diasIntervencion,
    alerta_monitoreo,
    alerta_intervencion,
    alerta: peorAlerta(alerta_monitoreo, alerta_intervencion),
  };
}

/** Para ordenar: lo vencido primero, después lo próximo, y dentro de cada grupo lo más cercano. */
export function compararUrgencia(a: SituacionBomba, b: SituacionBomba): number {
  const porAlerta = ORDEN.indexOf(a.alerta) - ORDEN.indexOf(b.alerta);
  if (porAlerta !== 0) return porAlerta;
  const cercania = (s: SituacionBomba) =>
    Math.min(
      s.dias_para_monitoreo ?? Infinity,
      s.dias_para_intervencion ?? Infinity,
    );
  // Dos sin fecha dan Infinity − Infinity = NaN: empatan.
  const diferencia = cercania(a) - cercania(b);
  return Number.isNaN(diferencia) ? 0 : diferencia;
}
