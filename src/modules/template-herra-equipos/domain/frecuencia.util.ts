import { FrecuenciaInspeccion } from '../schema/template-herra-equipo.schema';

const DIAS_POR_UNIDAD: Record<string, number> = {
  diaria: 1,
  semanal: 7,
  mensual: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

/**
 * Calcula la cantidad de días de la frecuencia configurada en un template.
 * Único lugar donde vive este mapeo — evita hardcodear el número de días
 * en cada consumidor (equipment-tracking, inspection-herra-equipos, etc.).
 */
export function diasPorFrecuencia(frecuencia: FrecuenciaInspeccion): number {
  if (frecuencia.unidad === 'personalizada') {
    return frecuencia.valorPersonalizado ?? 0;
  }
  return DIAS_POR_UNIDAD[frecuencia.unidad] ?? 0;
}
