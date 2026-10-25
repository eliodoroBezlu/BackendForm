/**
 * Qué datos tiene que tener una tarea para estar en cada estado, y qué
 * cambió entre dos versiones de una tarea (para su historial).
 *
 * Antes bastaba con que los campos no estuvieran vacíos: una acción propuesta
 * de una letra pasaba a «en progreso» y una fecha efectiva sola cerraba la
 * tarea, sin evidencia. Las mismas reglas valen para avanzar y para la
 * corrección del admin: corregir no puede dejar una tarea cerrada sin lo que
 * exige un cierre.
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

export const ESTADOS_DE_TAREA = ['abierto', 'en-progreso', 'cerrado'] as const;
export type EstadoDeTarea = (typeof ESTADOS_DE_TAREA)[number];

/** Una acción propuesta tiene que decir algo: «ok» o «x» no es una acción. */
export const LARGO_MINIMO_DE_ACCION = 10;

export const NOMBRE_DEL_ESTADO: Record<string, string> = {
  abierto: 'Abierto',
  'en-progreso': 'En progreso',
  cerrado: 'Cerrado',
};

export interface TareaConRequisitos {
  familiaPeligro?: string;
  accionPropuesta?: string;
  responsableAreaCierre?: string;
  fechaHallazgo?: Date | string;
  fechaCumplimientoAcordada?: Date | string;
  fechaCumplimientoEfectiva?: Date | string;
  evidencias?: { nombre?: string; url?: string }[];
}

const vacio = (texto?: string) => !texto || texto.trim() === '';

/** Fecha de calendario (sin hora), o null si no es una fecha válida. */
const dia = (fecha?: Date | string): number | null => {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Lo que le falta a la tarea para estar en `destino`, en frases que se
 * muestran tal cual. Vacío: puede estar en ese estado.
 */
export function faltantesParaEstado(
  tarea: TareaConRequisitos,
  destino: string,
  hoy: Date = new Date(),
): string[] {
  if (destino !== 'en-progreso' && destino !== 'cerrado') return [];

  const faltan: string[] = [];
  if (vacio(tarea.familiaPeligro)) faltan.push('la familia de peligro');
  if (vacio(tarea.accionPropuesta)) {
    faltan.push('la acción propuesta');
  } else if (tarea.accionPropuesta!.trim().length < LARGO_MINIMO_DE_ACCION) {
    faltan.push(
      `una acción propuesta más completa (al menos ${LARGO_MINIMO_DE_ACCION} caracteres)`,
    );
  }
  if (vacio(tarea.responsableAreaCierre)) {
    faltan.push('el responsable de área para el cierre');
  }

  const hallazgo = dia(tarea.fechaHallazgo);
  const acordada = dia(tarea.fechaCumplimientoAcordada);
  if (acordada === null) {
    faltan.push('la fecha de cumplimiento acordada');
  } else if (hallazgo !== null && acordada < hallazgo) {
    faltan.push('una fecha acordada que no sea anterior al hallazgo');
  }

  if (destino === 'cerrado') {
    const efectiva = dia(tarea.fechaCumplimientoEfectiva);
    if (efectiva === null) {
      faltan.push('la fecha de cumplimiento efectiva');
    } else {
      if (hallazgo !== null && efectiva < hallazgo) {
        faltan.push('una fecha efectiva que no sea anterior al hallazgo');
      }
      if (efectiva > dia(hoy)!) {
        faltan.push('una fecha efectiva que no sea futura');
      }
    }
    const evidencias = (tarea.evidencias ?? []).filter(
      (e) => e && !vacio(e.url),
    );
    if (evidencias.length === 0) {
      faltan.push('al menos una evidencia del cierre');
    }
  }

  return faltan;
}

/** «Para pasar a En progreso falta: la acción propuesta; la fecha…». */
export const mensajeDeFaltantes = (destino: string, faltan: string[]) =>
  `Para pasar a ${NOMBRE_DEL_ESTADO[destino] ?? destino} falta: ${faltan.join('; ')}.`;

export const posicionDelEstado = (estado?: string): number =>
  ESTADOS_DE_TAREA.indexOf((estado ?? 'abierto') as EstadoDeTarea);

/** Los campos que se siguen en el historial, con cómo se llaman en pantalla. */
export const CAMPOS_DEL_HISTORIAL: Record<string, string> = {
  estado: 'Estado',
  fechaHallazgo: 'Fecha del hallazgo',
  responsableObservacion: 'Responsable de la observación',
  empresa: 'Empresa',
  lugarFisico: 'Lugar físico',
  actividad: 'Actividad',
  descripcionObservacion: 'Descripción de la observación',
  familiaPeligro: 'Familia de peligro',
  accionPropuesta: 'Acción propuesta',
  responsableAreaCierre: 'Responsable de área',
  fechaCumplimientoAcordada: 'Fecha acordada',
  fechaCumplimientoEfectiva: 'Fecha efectiva',
  evidencias: 'Evidencias',
  aprobado: 'Aprobada',
};

export interface CambioDeCampo {
  campo: string;
  antes: string;
  despues: string;
}

/** Cómo se guarda un valor en el historial: texto legible y comparable. */
const comoTexto = (valor: unknown): string => {
  if (valor === undefined || valor === null || valor === '') return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor)) {
    return valor
      .map((v: { nombre?: string }) => v?.nombre ?? String(v))
      .join(', ');
  }
  // Fechas que llegan como texto ISO.
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
    return valor.slice(0, 10);
  }
  return String(valor).trim();
};

/** Qué campos seguidos cambiaron entre `antes` y `despues`. */
export function cambiosDeTarea(
  antes: object,
  despues: object,
): CambioDeCampo[] {
  const previo = antes as Record<string, unknown>;
  const nuevo = despues as Record<string, unknown>;
  const cambios: CambioDeCampo[] = [];
  for (const campo of Object.keys(CAMPOS_DEL_HISTORIAL)) {
    if (!(campo in nuevo)) continue;
    const a = comoTexto(previo[campo]);
    const d = comoTexto(nuevo[campo]);
    if (a !== d) cambios.push({ campo, antes: a, despues: d });
  }
  return cambios;
}
