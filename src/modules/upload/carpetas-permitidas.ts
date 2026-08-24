/**
 * Carpetas donde se admite guardar archivos subidos.
 *
 * Es una **lista blanca**, no un parámetro libre: el destino llega en el
 * request, y concatenar eso a una ruta sin validarlo deja escribir en cualquier
 * parte del disco con un `../`. Aquí la clave del cliente ni siquiera es una
 * ruta, es un identificador que se traduce.
 */
export const CARPETAS_SUBIDA: Record<string, string> = {
  /** Valor histórico: todo caía aquí, fuera o no de una tarea. */
  tareas: './uploads/evidencias-tareas',
  linternas: './uploads/evidencias-linternas',
  /** Fotos del inventario: identifican el equipo, no documentan un incidente. */
  equipos: './uploads/fotos-equipos',
};

export const CARPETA_POR_DEFECTO = 'tareas';

export function rutaDeCarpeta(clave?: string): string {
  return (
    CARPETAS_SUBIDA[clave ?? CARPETA_POR_DEFECTO] ??
    CARPETAS_SUBIDA[CARPETA_POR_DEFECTO]
  );
}
