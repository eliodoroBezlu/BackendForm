/**
 * Consulta del reporte de Sistemas de Emergencia (`GET /inspecciones-emergencia`).
 *
 * Por qué así:
 * - El formulario guarda la superintendencia como texto del día en que se creó, y muchos tienen un
 *   nombre que el maestro ya cambió al sincronizar con el IAM («Mec. Planta Flotación…» →
 *   «Mec. Plta. Flot.…»). Filtrar por ese texto dejaba el reporte vacío al elegir área y
 *   superintendencia. Ahora la superintendencia se resuelve por el maestro: entran los formularios
 *   de sus áreas, y solo los de un área que el maestro no conoce se comparan por el texto guardado.
 * - Los textos se comparan enteros (sin distinguir mayúsculas ni espacios en los bordes) y
 *   escapados: antes eran `$regex` sin escapar, así que «Generacion» también traía
 *   «Generacion 2» y los «.» de «Mec. Plta.» hacían de comodín.
 *
 * - Los formularios «archivado» no salen nunca: son las copias duplicadas de agosto de 2026, ya
 *   juntadas con su original (ver `limpieza-datos/`).
 *
 * Función pura: se prueba sin base de datos.
 */
import type { FilterQuery } from 'mongoose';
import { normalizarNombre } from '../../planes-accion/domain/alcance-plan';

export const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const;

export interface FiltrosReporte {
  area?: string;
  superintendencia?: string;
  /** El mes que debe tener inspección (no el «mes actual» del formulario). */
  mesActual?: string;
  documentCode?: string;
  anio?: string;
}

/** Un área activa del maestro con el nombre de su superintendencia. */
export interface AreaDelMaestro {
  nombre: string;
  superintendencia: string | null;
}

const escapar = (texto: string): string =>
  texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El texto entero, sin distinguir mayúsculas y tolerando espacios en los bordes. */
export const nombreExacto = (texto: string): RegExp =>
  new RegExp(`^\\s*${escapar(texto.trim())}\\s*$`, 'i');

const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim() : '';

export function consultaDelReporte(
  filtros: FiltrosReporte,
  maestro: readonly AreaDelMaestro[],
): FilterQuery<unknown> {
  const condiciones: FilterQuery<unknown>[] = [
    { estado: { $ne: 'archivado' } },
  ];

  const area = texto(filtros.area);
  if (area) condiciones.push({ area: nombreExacto(area) });

  const superintendencia = texto(filtros.superintendencia);
  if (superintendencia) {
    const elegida = normalizarNombre(superintendencia);
    const suyas = maestro
      .filter((a) => normalizarNombre(a.superintendencia) === elegida)
      .map((a) => nombreExacto(a.nombre));
    const conocidas = maestro.map((a) => nombreExacto(a.nombre));
    condiciones.push({
      $or: [
        { area: { $in: suyas } },
        {
          area: { $nin: conocidas },
          superintendencia: nombreExacto(superintendencia),
        },
      ],
    });
  }

  const mes = texto(filtros.mesActual).toUpperCase();
  // Solo un mes válido: el nombre va a una ruta de campo (`meses.<MES>`).
  if ((MESES as readonly string[]).includes(mes)) {
    condiciones.push({ [`meses.${mes}`]: { $exists: true } });
  }

  const documentCode = texto(filtros.documentCode);
  if (documentCode) {
    condiciones.push({
      documentCode: { $regex: escapar(documentCode), $options: 'i' },
    });
  }

  const anio = Number.parseInt(texto(filtros.anio), 10);
  if (Number.isInteger(anio)) condiciones.push({ año: anio });

  return condiciones.length === 1 ? condiciones[0] : { $and: condiciones };
}
