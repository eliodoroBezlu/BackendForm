/**
 * Qué cambia en un plan de acción cuando se edita la IRO de la que salió.
 *
 * Los datos de la cabecera de la IRO (gerencia, superintendencias, área,
 * empresa, supervisor) se copiaron al plan y a sus tareas al generarlo. Si
 * después se corrige la IRO —por ejemplo, el supervisor estaba mal—, el plan
 * se quedaba con el dato viejo y había que arreglarlo tarea por tarea. Ahora
 * se propaga «en cascada».
 *
 * Reglas:
 * - Cabecera del plan: vicepresidencia, superintendencia sénior,
 *   superintendencia y área física toman el valor de la IRO. Un dato que la
 *   IRO no tiene («… no especificada») no pisa lo que haya en el plan.
 * - Tareas que salieron de esa IRO (no las agregadas a mano, no las dadas de
 *   baja, no las aprobadas): responsable de la observación, empresa y lugar
 *   físico.
 * - El responsable de cierre solo si sigue siendo el que puso la IRO (el
 *   supervisor viejo, sin usuario elegido): si alguien ya eligió a otro,
 *   esa decisión se respeta.
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

import { usuariosDeCierre } from './responsables-cierre';
import type { PlanMetadatosOrganizacionales } from './generar-plan.logic';

export interface PlanParaSincronizar {
  vicepresidencia?: string;
  superintendenciaSenior?: string;
  superintendencia?: string;
  areaFisica?: string;
  tareas: TareaParaSincronizar[];
}

export interface TareaParaSincronizar {
  instanceId?: string;
  activo?: boolean;
  aprobado?: boolean;
  responsableObservacion?: string;
  empresa?: string;
  lugarFisico?: string;
  responsableAreaCierre?: string;
  responsableAreaCierreUsername?: string;
  responsablesAreaCierreUsernames?: string[];
}

export interface CambiosDesdeLaInspeccion {
  cabecera: Partial<
    Pick<
      PlanParaSincronizar,
      | 'vicepresidencia'
      | 'superintendenciaSenior'
      | 'superintendencia'
      | 'areaFisica'
    >
  >;
  /** Por índice de tarea en `plan.tareas`: los campos que cambian. */
  tareas: { indice: number; cambios: Record<string, string> }[];
}

const sinDato = (valor: string) =>
  !valor.trim() || /no especificad|no asignado/i.test(valor);

export function cambiosDesdeLaInspeccion(
  plan: PlanParaSincronizar,
  instanceId: string,
  datos: PlanMetadatosOrganizacionales,
): CambiosDesdeLaInspeccion {
  const cabecera: CambiosDesdeLaInspeccion['cabecera'] = {};
  for (const campo of [
    'vicepresidencia',
    'superintendenciaSenior',
    'superintendencia',
    'areaFisica',
  ] as const) {
    const nuevo = datos[campo];
    if (!sinDato(nuevo) && plan[campo] !== nuevo) cabecera[campo] = nuevo;
  }

  const tareas: CambiosDesdeLaInspeccion['tareas'] = [];
  plan.tareas.forEach((tarea, indice) => {
    if (tarea.instanceId !== instanceId) return;
    if (tarea.activo === false || tarea.aprobado) return;

    const cambios: Record<string, string> = {};
    const poner = (campo: keyof TareaParaSincronizar, nuevo: string) => {
      if (!sinDato(nuevo) && tarea[campo] !== nuevo) cambios[campo] = nuevo;
    };
    poner('responsableObservacion', datos.supervisor);
    poner('empresa', datos.empresa);
    poner('lugarFisico', datos.areaFisica);

    const cierreLoPusoLaIro =
      usuariosDeCierre(tarea).length === 0 &&
      tarea.responsableAreaCierre === tarea.responsableObservacion;
    if (cierreLoPusoLaIro) poner('responsableAreaCierre', datos.supervisor);

    if (Object.keys(cambios).length > 0) tareas.push({ indice, cambios });
  });

  return { cabecera, tareas };
}
