/**
 * El otro sentido de la cascada: lo que se corrige en la descripción de una
 * tarea vuelve al comentario de su pregunta en la IRO.
 *
 * Con esto la descripción y el comentario quedan iguales venga de donde venga
 * el cambio, y sigue ganando la última edición: si después se corrige el
 * comentario en la IRO, baja al plan (ver `sincronizar-con-inspeccion.ts`).
 *
 * Reglas:
 * - Solo tareas que salieron de una IRO, activas y sin aprobar.
 * - La pregunta se busca por el título de su sección y su texto, como en el
 *   otro sentido: el `sectionId` de la tarea puede ser de una plantilla vieja.
 * - Si la IRO ya dice eso, o no se encuentra la pregunta, no se toca nada.
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

import {
  crearMapaSecciones,
  type SectionResponseLike,
  type TemplateLike,
} from './generar-plan.logic';
import { claveDePregunta } from './sincronizar-con-inspeccion';

export interface TareaConPregunta {
  instanceId?: string;
  activo?: boolean;
  aprobado?: boolean;
  sectionTitle?: string;
  questionText?: string;
  descripcionObservacion?: string;
}

/** Dónde escribir en la IRO y qué había antes. */
export interface ComentarioALaInspeccion {
  seccion: number;
  pregunta: number;
  antes: string;
  despues: string;
}

export function comentarioALaInspeccion(
  tarea: TareaConPregunta,
  sections: SectionResponseLike[],
  template: TemplateLike,
): ComentarioALaInspeccion | null {
  if (!tarea.instanceId || tarea.activo === false || tarea.aprobado) {
    return null;
  }
  const despues = (tarea.descripcionObservacion ?? '').trim();
  if (!despues) return null;

  const titulos = crearMapaSecciones(template.sections);
  const buscada = claveDePregunta(tarea.sectionTitle, tarea.questionText);

  for (const [seccion, section] of sections.entries()) {
    const titulo = titulos.get(String(section.sectionId))?.title;
    if (titulo === undefined) continue;
    for (const [pregunta, question] of section.questions.entries()) {
      if (claveDePregunta(titulo, question.questionText) !== buscada) continue;
      const antes = question.comment ?? '';
      if (antes.trim() === despues) return null;
      return { seccion, pregunta, antes, despues };
    }
  }
  return null;
}
