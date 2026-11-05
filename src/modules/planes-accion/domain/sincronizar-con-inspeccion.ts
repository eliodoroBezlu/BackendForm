/**
 * Qué cambia en un plan de acción cuando se edita la IRO de la que salió.
 *
 * Los datos de la cabecera de la IRO (gerencia, superintendencias, área,
 * empresa, supervisor) y el comentario de cada pregunta observada se copiaron
 * al plan y a sus tareas al generarlo. Si después se corrige la IRO —el
 * supervisor estaba mal, se escribió mejor una observación—, el plan se
 * quedaba con el dato viejo. Ahora se propaga «en cascada».
 *
 * **Gana la última edición, campo por campo.** Se compara la IRO de antes con
 * la de después y solo baja al plan lo que cambió en esa edición. Si alguien
 * corrigió un dato en el plan y después se edita *otra cosa* de la IRO, su
 * corrección se queda; si se vuelve a editar *ese* dato en la IRO, gana la
 * IRO. Lo que se pisa queda en el historial de la tarea con su valor anterior.
 *
 * Sin la IRO de antes (sincronización pedida a mano por el admin), se trae
 * todo lo de la IRO tal como está ahora.
 *
 * Reglas:
 * - Cabecera del plan: vicepresidencia, superintendencia sénior,
 *   superintendencia y área física. Un dato que la IRO no tiene
 *   («… no especificada») no pisa lo que haya en el plan.
 * - Tareas que salieron de esa IRO (no las agregadas a mano, no las dadas de
 *   baja, no las aprobadas): responsable de la observación, empresa, lugar
 *   físico y la descripción (el comentario de su pregunta, que se reconoce por
 *   el título de la sección y el texto de la pregunta).
 * - El responsable de cierre solo si sigue siendo el que puso la IRO (el
 *   supervisor viejo, sin usuario elegido): si alguien ya eligió a otro,
 *   esa decisión se respeta.
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

import { usuariosDeCierre } from './responsables-cierre';
import type {
  PlanMetadatosOrganizacionales,
  TareaGenerada,
} from './generar-plan.logic';

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
  sectionTitle?: string;
  questionText?: string;
  responsableObservacion?: string;
  empresa?: string;
  lugarFisico?: string;
  descripcionObservacion?: string;
  responsableAreaCierre?: string;
  responsableAreaCierreUsername?: string;
  responsablesAreaCierreUsernames?: string[];
}

/** Lo que el plan toma de una versión de la IRO. */
export interface DatosDeLaInspeccion {
  metadatos: PlanMetadatosOrganizacionales;
  /** Descripción de cada pregunta observada, por `claveDePregunta`. */
  descripciones: Record<string, string>;
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

/** Una pregunta de la IRO: su sección y su texto. */
const normalizar = (texto?: string) =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Una pregunta de la IRO: el título de su sección y su texto, sin tildes,
 * mayúsculas ni espacios de más. No se usa el `sectionId`: cuando una
 * plantilla se vuelve a guardar sus secciones cambian de id, y las tareas
 * guardan el de entonces.
 */
export const claveDePregunta = (sectionTitle?: string, questionText?: string) =>
  `${normalizar(sectionTitle)}::${normalizar(questionText)}`;

/** Lo que el plan toma de lo que genera una versión de la IRO. */
export function datosDeLaInspeccion(generado: {
  metadatosOrganizacionales: PlanMetadatosOrganizacionales;
  tareas: Pick<
    TareaGenerada,
    'sectionTitle' | 'questionText' | 'descripcionObservacion'
  >[];
}): DatosDeLaInspeccion {
  const descripciones: Record<string, string> = {};
  for (const t of generado.tareas) {
    descripciones[claveDePregunta(t.sectionTitle, t.questionText)] =
      t.descripcionObservacion;
  }
  return { metadatos: generado.metadatosOrganizacionales, descripciones };
}

const sinDato = (valor?: string) =>
  !valor?.trim() || /no especificad|no asignado/i.test(valor);

export function cambiosDesdeLaInspeccion(
  plan: PlanParaSincronizar,
  instanceId: string,
  nuevo: DatosDeLaInspeccion,
  anterior?: DatosDeLaInspeccion,
): CambiosDesdeLaInspeccion {
  /** ¿Este dato cambió en la IRO en esta edición? Sin la de antes, siempre. */
  const cambioEnLaIro = (antes: string | undefined, ahora: string) =>
    anterior === undefined || (antes ?? '') !== ahora;

  const cabecera: CambiosDesdeLaInspeccion['cabecera'] = {};
  for (const campo of [
    'vicepresidencia',
    'superintendenciaSenior',
    'superintendencia',
    'areaFisica',
  ] as const) {
    const ahora = nuevo.metadatos[campo];
    if (sinDato(ahora) || plan[campo] === ahora) continue;
    if (cambioEnLaIro(anterior?.metadatos[campo], ahora)) {
      cabecera[campo] = ahora;
    }
  }

  const tareas: CambiosDesdeLaInspeccion['tareas'] = [];
  plan.tareas.forEach((tarea, indice) => {
    if (tarea.instanceId !== instanceId) return;
    if (tarea.activo === false || tarea.aprobado) return;

    const cambios: Record<string, string> = {};
    const poner = (
      campo: keyof TareaParaSincronizar,
      antes: string | undefined,
      ahora: string | undefined,
    ) => {
      if (ahora === undefined || sinDato(ahora) || tarea[campo] === ahora) {
        return;
      }
      if (cambioEnLaIro(antes, ahora)) cambios[campo] = ahora;
    };

    const viejo = anterior?.metadatos;
    poner(
      'responsableObservacion',
      viejo?.supervisor,
      nuevo.metadatos.supervisor,
    );
    poner('empresa', viejo?.empresa, nuevo.metadatos.empresa);
    poner('lugarFisico', viejo?.areaFisica, nuevo.metadatos.areaFisica);

    const clave = claveDePregunta(tarea.sectionTitle, tarea.questionText);
    poner(
      'descripcionObservacion',
      anterior?.descripciones[clave],
      nuevo.descripciones[clave],
    );

    // El cierre lo puso la IRO si nadie eligió usuarios y sigue siendo el
    // supervisor de entonces (el de antes de esta edición, si se conoce).
    const supervisorDeEntonces =
      viejo?.supervisor ?? tarea.responsableObservacion;
    const cierreLoPusoLaIro =
      usuariosDeCierre(tarea).length === 0 &&
      tarea.responsableAreaCierre === supervisorDeEntonces;
    if (cierreLoPusoLaIro) {
      poner(
        'responsableAreaCierre',
        viejo?.supervisor,
        nuevo.metadatos.supervisor,
      );
    }

    if (Object.keys(cambios).length > 0) tareas.push({ indice, cambios });
  });

  return { cabecera, tareas };
}
