import { Role } from '../../auth/enums/role.enum';

/**
 * Quién puede ver un plan que todavía no tiene la aprobación global.
 *
 * La regla completa vive aquí, y no repartida por el servicio, porque es una
 * barrera de seguridad: se aplica en `findAll` y en `findOne`, y las dos deben
 * decir exactamente lo mismo. Cuando la comprobación está duplicada, tarde o
 * temprano una de las copias se queda atrás.
 */

/** Roles que ven el catálogo completo, aprobado o no. */
export const ROLES_CON_VISION_COMPLETA: readonly string[] = [
  Role.ADMIN,
  Role.SUPERINTENDENTE,
];

export const ESTADO_APROBACION_APROBADO = 'aprobado';

/**
 * Un supervisor —que no sea además admin o superintendente— nunca debe recibir
 * un plan pendiente de aprobación global.
 *
 * Sin roles la respuesta es `false`: ante la duda, se restringe.
 */
export const puedeVerPlanesSinAprobar = (roles?: string[] | null): boolean =>
  !!roles && roles.some((rol) => ROLES_CON_VISION_COMPLETA.includes(rol));

/**
 * Decide si un plan concreto es visible para quien lo pide.
 *
 * Se expresa sobre el estado del plan y no sobre la consulta a la base de
 * datos para poder comprobarla sin Mongo — la consulta de `findAll` aplica la
 * misma regla como filtro.
 */
export const planEsVisible = (
  plan: { estadoAprobacion?: string },
  roles?: string[] | null,
): boolean =>
  plan.estadoAprobacion === ESTADO_APROBACION_APROBADO ||
  puedeVerPlanesSinAprobar(roles);
