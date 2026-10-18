/**
 * Las listas del reporte de monitoreo.
 *
 * Las cuatro primeras salen de la hoja oculta `Sheet2` del formato
 * 2.03.P01.R09 Rev. 6, que hoy se copia de archivo en archivo; las demás, de la
 * planilla de carga de bombas. Se siembran una vez y después las mantiene
 * Confiabilidad: la siembra solo agrega lo que falta, nunca pisa lo editado.
 */
export enum TipoCatalogoMonitoreo {
  TECNICA = 'tecnica',
  GRUPO_TRABAJO = 'grupo_trabajo',
  PRIORIDAD_JDE = 'prioridad_jde',
  SEVERIDAD = 'severidad',
  FABRICANTE = 'fabricante',
  PROVEEDOR = 'proveedor',
  CONDICION_INICIAL = 'condicion_inicial',
  TIPO_INTERVENCION = 'tipo_intervencion',
  INSTRUMENTO = 'instrumento',
  PUNTO_REFERENCIA = 'punto_referencia',
}

export interface EntradaDeCatalogo {
  valor: string;
  /** Código corto: el de la técnica arma el código interno del reporte (`COTEM` - 0137). */
  codigo?: string;
  /** Color con el que se muestra (la severidad, como el formato condicional del Excel). */
  color?: string;
}

/** Colores del formato condicional de la celda ACCIÓN del 2.03.P01.R09. */
const COLOR_NORMAL = '#92D050';
const COLOR_SEGUIMIENTO = '#FFFF00';
const COLOR_PROGRAMADA = '#FFC000';
const COLOR_INMEDIATA = '#FF0000';

export const CATALOGOS_INICIALES: Record<
  TipoCatalogoMonitoreo,
  EntradaDeCatalogo[]
> = {
  [TipoCatalogoMonitoreo.TECNICA]: [
    { valor: 'INSPECCIÓN VISUAL GRAL.' },
    { valor: 'INSPECCIÓN MECANICA', codigo: 'COINM' },
    { valor: 'ANÁLISIS DE VIBRACIONES', codigo: 'COVIB' },
    { valor: 'ANALISIS DE ACEITE', codigo: 'COACI' },
    { valor: 'TERMOGRAFIA MECANICA', codigo: 'COTEM' },
    { valor: 'ULTRASONIDO ACTIVO', codigo: 'COULT' },
    { valor: 'ENSAYO NO DESTRUCTIVO', codigo: 'COEND' },
    { valor: 'ULTRASONIDO PASIVO MECANICO', codigo: 'COUPM' },
    { valor: 'ALINEACIÓN', codigo: 'COALI' },
    { valor: 'RESULTADO DE LABORATORIO', codigo: 'CORLE' },
    { valor: 'INSPECCIÓN ELECTRICA', codigo: 'COINE' },
    { valor: 'ANALISIS DE ACEITE ELECTRICA', codigo: 'COACD' },
    { valor: 'TERMOGRAFIA ELECTRICA', codigo: 'COTEE' },
    { valor: 'PRUEBA ELECTRICA MOTOR', codigo: 'COPEM' },
    { valor: 'PRUEBA ELECTRICA TRANFORMADOR', codigo: 'COPET' },
    { valor: 'MEDICION SISTEMA ATERRAMIENTO', codigo: 'COMST' },
    { valor: 'ULTRASONIDO PASIVO ELECTRICO', codigo: 'COUPE' },
    { valor: 'REPORTE SEMANAL', codigo: 'CORSC' },
  ],
  [TipoCatalogoMonitoreo.GRUPO_TRABAJO]: [
    'WG-Mecánico Chancado',
    'WG-Sistema de Aguas',
    'WG-Mecánico Flotacion',
    'WG-Mecánico Filtracion',
    'WG-Taller Mantenimiento Gral.',
    'WG-Servicios Tecnicos',
    'WG-Contratista TTMB',
    'WG-Electrico Planta',
    'WG-Instrumentación Planta',
    'WG-Ingeniería de Modificaciones',
    'WG-Planeación Semanal',
    'WG-Planeación Paradas',
    'WG-Planeación Partes',
    'WG-Taller Máquinas-Herramientas',
    'WG-Mecánico Molienda',
    'WG-Mecánico Lubricación & Puentes Grúa',
    'WG-Mantto. Equipo Liviano y Pesado',
    'WG-Confiabilidad',
    'WG-Contratista Electrico TESA',
    'WG-Contratista RADIOCOM',
    'WG-Monitoreo Electrico',
    'WG-Monitoreo Mecanico',
    'WG-Servicios Auxiliares',
    'WG-Operaciones',
    'WG-Vias Ferreas',
    'WG-Grupo Generación',
    'Otro',
  ].map((valor) => ({ valor })),
  [TipoCatalogoMonitoreo.PRIORIDAD_JDE]: [
    'Inmediata',
    'Urgente',
    'Normal',
    'De baja prioridad',
    'Muy baja prioridad',
  ].map((valor) => ({ valor })),
  [TipoCatalogoMonitoreo.SEVERIDAD]: [
    { valor: 'NORMAL', color: COLOR_NORMAL },
    { valor: 'SEGUIMIENTO', color: COLOR_SEGUIMIENTO },
    { valor: 'INTERVENCIÓN PROGRAMADA', color: COLOR_PROGRAMADA },
    { valor: 'INTERVENCIÓN INMEDIATA', color: COLOR_INMEDIATA },
    { valor: 'N/A' },
  ],
  [TipoCatalogoMonitoreo.FABRICANTE]: [{ valor: 'Warman' }],
  [TipoCatalogoMonitoreo.PROVEEDOR]: [
    { valor: 'Weir Vulco' },
    { valor: 'ALTONA' },
  ],
  [TipoCatalogoMonitoreo.CONDICION_INICIAL]: ['Nuevo', 'Reparado', 'Usado'].map(
    (valor) => ({ valor }),
  ),
  [TipoCatalogoMonitoreo.TIPO_INTERVENCION]: [
    'Cambio de piezas',
    'Mantenimiento',
    'Reparación',
    'Inspección interna',
  ].map((valor) => ({ valor })),
  [TipoCatalogoMonitoreo.INSTRUMENTO]: [
    { valor: 'FLIR E95' },
    { valor: 'EPOCH-XT' },
  ],
  [TipoCatalogoMonitoreo.PUNTO_REFERENCIA]: [
    'Pulpa',
    'Brida ciega',
    'Ambiente',
    'Otro',
  ].map((valor) => ({ valor })),
};

/** «  Weir  Vulco » y «weir vulco» son el mismo valor: la clave de unicidad dentro de un catálogo. */
export function normalizarValor(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
