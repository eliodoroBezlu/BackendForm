/**
 * Área que presta los SPCC.
 *
 * Vive aquí y en un solo sitio: repartir el nombre por el código convertiría
 * «ahora también presta Taller Soldadura» en una cacería por todo el módulo.
 * Se compara normalizado, así que un acento de más en el maestro no lo rompe.
 */
export const AREA_PRESTADORA = 'Oficina Mantenimiento';

/**
 * Tipos del inventario que este módulo presta.
 *
 * Son los cinco del SPCC. Deliberadamente no se prestan herramientas ni
 * vehículos: el flujo, las firmas y el acta están pensados para equipo de
 * protección contra caídas.
 */
export const TIPOS_PRESTABLES = [
  'Arnes',
  'Autoretractil',
  'Retractil',
  'ConectorTT',
  'ConectorAN',
] as const;

/**
 * Cómo se llama cada tipo cuando lo lee una persona.
 *
 * El inventario los guarda sin acentos y pegados (`Autoretractil`) porque son
 * claves, no texto; el acta no puede imprimir eso.
 */
export const ETIQUETA_TIPO: Record<string, string> = {
  Arnes: 'Arnés',
  Autoretractil: 'Autorretráctil',
  Retractil: 'Retráctil',
  ConectorTT: 'Conector TT',
  ConectorAN: 'Conector de anclaje',
};

/** Estados del equipo que impiden prestarlo. */
export const ESTADOS_NO_PRESTABLES = [
  'De Baja',
  'Inoperativo',
  'Mantenimiento',
];

export const normalizar = (texto: string): string =>
  texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
