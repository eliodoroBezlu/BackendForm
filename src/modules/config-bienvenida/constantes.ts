/**
 * Catálogo **cerrado** de animaciones.
 *
 * Elegir de una lista y no subir un archivo es una decisión deliberada:
 *
 *  - La CSP del frontend es `default-src 'self'`, así que una animación
 *    servida desde un CDN externo quedaría bloqueada.
 *  - Un SVG subido por un usuario es **código ejecutable** —puede llevar
 *    `<script>`—, y la pantalla previa al login es el peor sitio para aceptar
 *    eso.
 *  - Una lista cerrada se prueba una vez y siempre funciona; un archivo subido
 *    puede pesar 4 MB o romper el diseño en un teléfono.
 *
 * Si algún día hace falta una animación de marca, se **añade aquí**, revisada,
 * y se selecciona igual que las demás. La lista vive en el backend para que
 * valide, y se espeja en el frontend, que es quien las dibuja.
 */
export const CATALOGO_ANIMACIONES = [
  'circular',
  'barra',
  'puntos',
  'logo',
  'casco',
  'ninguna',
] as const;

export type ClaveAnimacion = (typeof CATALOGO_ANIMACIONES)[number];

/**
 * Lo que se devuelve cuando no hay nada configurado.
 *
 * El servicio **nunca responde 404**: una instalación recién montada tiene que
 * funcionar sin que nadie entre a configurar nada, y el frontend no debería
 * necesitar un caso especial para «todavía no existe».
 */
export const BIENVENIDA_POR_DEFECTO = {
  clave: 'bienvenida',
  activa: true,
  mensaje: 'Sistema de Inspecciones',
  submensaje: 'Preparando su sesión…',
  animacion: 'circular' as ClaveAnimacion,
  duracionMinimaMs: 600,
  duracionMaximaMs: 8000,
  consejos: [] as string[],
  mantenimiento: { activo: false },
  porArea: [] as {
    area: string;
    mensaje?: string;
    submensaje?: string;
    animacion?: string;
  }[],
};

/** Topes de duración. Fuera de esto la pantalla estorba en vez de ayudar. */
export const DURACION_MINIMA_TOPE = 5000;
export const DURACION_MAXIMA_TOPE = 30000;
