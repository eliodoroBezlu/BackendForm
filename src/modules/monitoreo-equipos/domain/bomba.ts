/**
 * La bomba en el inventario de equipos.
 *
 * Fabricante y modelo van en los campos propios del equipo (`marca`,
 * `modelo`). El resto de su ficha vive en `especificaciones`, con **la
 * cabecera de la planilla de carga como clave**: es la convención del
 * inventario (el exportador escribe y el importador lee las especificaciones
 * por el texto de la cabecera), así la ficha va y vuelve por Excel sin
 * traducciones.
 */
export const TIPO_EQUIPO_BOMBA = 'Bomba';

/** Clasificación del inventario en la que quedan las bombas. */
export const CLASIFICACION_BOMBAS = 'Bombas';

/** Área dueña de las bombas monitoreadas (el catálogo de termografía es «CONFIABILIDAD - DESGASTE»). */
export const AREA_CONFIABILIDAD = 'Confiabilidad';

/** Sin ubicación en la planilla: la misma convención que el importador del inventario. */
export const UBICACION_POR_DEFECTO = 'Sin Ubicación';

export const ESPECIFICACION_BOMBA = {
  servicio: 'Servicio / proceso',
  tmef: 'TMEF (hrs)',
  tagPi: 'Tag de horas en PI',
  pares: 'Bombas pares',
  otModelo: 'OT modelo',
  frecuencia: 'Frecuencia (días)',
} as const;

/** Los campos de la ficha para `config_formularios`: así se ven y se editan en el panel de inventario. */
export const CAMPOS_FICHA_BOMBA = [
  {
    name: ESPECIFICACION_BOMBA.servicio,
    label: 'Servicio / proceso',
    type: 'text',
    required: false,
  },
  {
    name: ESPECIFICACION_BOMBA.tmef,
    label: 'TMEF (hrs)',
    type: 'number',
    required: false,
  },
  {
    name: ESPECIFICACION_BOMBA.tagPi,
    label: 'Tag de horas en PI',
    type: 'text',
    required: false,
  },
  {
    name: ESPECIFICACION_BOMBA.pares,
    label: 'Bombas pares',
    type: 'text',
    required: false,
  },
  {
    name: ESPECIFICACION_BOMBA.otModelo,
    label: 'OT modelo',
    type: 'text',
    required: false,
  },
  {
    name: ESPECIFICACION_BOMBA.frecuencia,
    label: 'Frecuencia (días)',
    type: 'number',
    required: false,
  },
];

/**
 * Las piezas de desgaste de una bomba. Son fijas por tipo de equipo: la tabla
 * de piezas del formato 2.03.P01.R09 siempre trae estas cuatro.
 */
export const PIEZAS_BOMBA = [
  'Voluta',
  'Impulsor',
  'Disco prensa',
  'Disco succión',
] as const;
export type PiezaBomba = (typeof PIEZAS_BOMBA)[number];

/** Un TAG de equipo de planta: área de 3 dígitos, letras y número (`230PP013`, `420PP557P`). */
export const FORMA_TAG = /^\d{3}[A-Z]{2}\d{3}[A-Z]?$/;
