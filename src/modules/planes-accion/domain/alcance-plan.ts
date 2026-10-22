import { Role } from '../../auth/enums/role.enum';

/**
 * Qué planes le tocan a cada quien según su lugar en la organización.
 *
 * Es la segunda barrera de `findAll` y `findOne`, aparte de la de aprobación
 * (`visibilidad-plan.ts`): un plan tiene que pasar las dos. Antes este filtro
 * lo hacía la página, con todos los planes ya descargados en el navegador.
 *
 * - admin: todos;
 * - superintendente: los de las áreas de su superintendencia;
 * - supervisor (y cualquier otro rol que entre): los de su área;
 * - todos, además, los planes donde tienen una tarea a su cargo.
 *
 * Los roles se suman: un superintendente que además es supervisor ve las dos
 * cosas. El área del plan sale del texto que escribió el inspector en la IRO,
 * así que se compara sin espacios, mayúsculas ni tildes («Chancado » es
 * «chancado»).
 */

const ROLES_QUE_VEN_TODO: readonly string[] = [Role.ADMIN, Role.SUPER_ADMIN];

export const normalizarNombre = (texto?: string | null): string =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface AlcanceDePlanes {
  todo: boolean;
  /** Áreas normalizadas. */
  areas: ReadonlySet<string>;
  /** Superintendencias normalizadas. */
  superintendencias: ReadonlySet<string>;
  username?: string;
}

export interface DatosDelUsuario {
  roles?: string[] | null;
  username?: string | null;
  /** De su ficha de trabajador; sin ficha, solo ve sus tareas. */
  area?: string | null;
  superintendencia?: string | null;
}

/** Un área del maestro con su superintendencia (`AreaService.obtenerCadenaOrganizativa`). */
export interface AreaDelMaestro {
  area: string;
  superintendencia: string | null;
}

export function alcanceDe(
  usuario: DatosDelUsuario,
  maestro: readonly AreaDelMaestro[],
): AlcanceDePlanes {
  const roles = usuario.roles ?? [];
  const areas = new Set<string>();
  const superintendencias = new Set<string>();
  const alcance = {
    todo: roles.some((rol) => ROLES_QUE_VEN_TODO.includes(rol)),
    areas,
    superintendencias,
    username: usuario.username ?? undefined,
  };
  if (alcance.todo) return alcance;

  const suya = normalizarNombre(usuario.superintendencia);
  if (roles.includes(Role.SUPERINTENDENTE) && suya) {
    superintendencias.add(suya);
    for (const fila of maestro) {
      if (normalizarNombre(fila.superintendencia) === suya) {
        areas.add(normalizarNombre(fila.area));
      }
    }
  }

  const area = normalizarNombre(usuario.area);
  if (area) areas.add(area);

  return alcance;
}

export interface PlanConLugar {
  areaFisica?: string;
  superintendencia?: string;
  tareas?: { responsableAreaCierreUsername?: string; activo?: boolean }[];
}

export function planDentroDelAlcance(
  plan: PlanConLugar,
  alcance: AlcanceDePlanes,
): boolean {
  if (alcance.todo) return true;
  if (alcance.areas.has(normalizarNombre(plan.areaFisica))) return true;
  if (alcance.superintendencias.has(normalizarNombre(plan.superintendencia))) {
    return true;
  }
  return (
    !!alcance.username &&
    (plan.tareas ?? []).some(
      (t) =>
        t.activo !== false &&
        t.responsableAreaCierreUsername === alcance.username,
    )
  );
}
