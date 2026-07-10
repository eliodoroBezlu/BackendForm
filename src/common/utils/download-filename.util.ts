/**
 * Construye nombres de archivo legibles para descargas de inspecciones
 * (formato: "nombre de inspección_área_inspector_fecha.ext") y el header
 * Content-Disposition correspondiente, con soporte RFC 6266 para que los
 * acentos sobrevivan en todos los navegadores.
 */

const FALLBACK = 'N-A';

function sanitizePart(value: string | undefined | null): string {
  if (!value) return FALLBACK;
  const clean = value
    .replace(/[\\/:*?"<>|]/g, '-') // caracteres inválidos en nombres de archivo
    .replace(/\s+/g, ' ')
    .trim();
  return clean || FALLBACK;
}

function formatFecha(fecha: Date | string | undefined): string {
  const date = fecha ? new Date(fecha) : new Date();
  if (Number.isNaN(date.getTime()))
    return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function buildInspectionFilename(
  nombreInspeccion: string,
  area: string,
  inspector: string,
  fecha: Date | string | undefined,
  extension: 'pdf' | 'xlsx',
): string {
  const parts = [
    sanitizePart(nombreInspeccion),
    sanitizePart(area),
    sanitizePart(inspector),
    formatFecha(fecha),
  ];
  return `${parts.join('_')}.${extension}`;
}

/**
 * Devuelve el valor completo del header Content-Disposition (incluye
 * "attachment;"). `filename` va sin comillas ni codificar — esta función
 * se encarga de ambas variantes (ASCII fallback + UTF-8 percent-encoded).
 */
export function buildContentDispositionHeader(filename: string): string {
  const asciiFallback = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diacríticos para el fallback ASCII
    .replace(/[^\x20-\x7E]/g, '_'); // cualquier otro no-ASCII restante
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Evita colisiones de nombre dentro de un mismo lote (p. ej. al armar un
 * ZIP): si `filename` ya se usó antes en `usados`, agrega " (2)", " (3)", etc.
 * antes de la extensión. Muta `usados` registrando el nombre final devuelto.
 */
export function dedupeFilename(
  filename: string,
  usados: Map<string, number>,
): string {
  const count = usados.get(filename) ?? 0;
  usados.set(filename, count + 1);
  if (count === 0) return filename;

  const lastDot = filename.lastIndexOf('.');
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot);
  const ext = lastDot === -1 ? '' : filename.slice(lastDot);
  return `${base} (${count + 1})${ext}`;
}
