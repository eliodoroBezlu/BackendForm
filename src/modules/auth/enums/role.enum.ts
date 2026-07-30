export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SUPER_ADMIN = 'super_admin',
  INSPECTOR = 'inspector',
  TECNICO = 'tecnico',
  SUPERVISOR = 'supervisor',
  SUPERINTENDENTE = 'superintendente',
  /**
   * Rol de visibilidad acotada. Solo ve las plantillas de Herramientas y
   * Equipos que lo declaran en `rolesVisibles`, y los reportes de esas mismas
   * plantillas. Puede llenar inspecciones, pero no crear la estructura de un
   * formulario (eso sigue siendo exclusivo de admin).
   *
   * Debe existir con este mismo valor en `availableRoles` del servicio
   * `forms` en IAM Core, de donde llega vía sync a `Trabajador.roles_iam`.
   */
  INSPECTOR_ASIGNADO = 'inspector_asignado',
}

/**
 * Roles con visibilidad total sobre el catálogo de plantillas.
 * El resto solo ve las que lo declaran en `rolesVisibles`.
 */
export const ROLES_VISIBILIDAD_TOTAL: string[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.SUPERINTENDENTE,
  Role.SUPERVISOR,
];
