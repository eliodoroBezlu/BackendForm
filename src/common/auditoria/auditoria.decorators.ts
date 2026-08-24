import { SetMetadata } from '@nestjs/common';

export const SIN_AUDITORIA = 'sinAuditoria';
export const RECURSO_AUDITORIA = 'recursoAuditoria';

/**
 * Excluye un endpoint de la auditoría.
 *
 * Para lo que no aporta nada al historial (comprobaciones de salud, endpoints
 * muy ruidosos). Úsese con cuentagotas: lo que se excluye deja de existir para
 * quien luego pregunte qué pasó.
 */
export const SinAuditoria = () => SetMetadata(SIN_AUDITORIA, true);

/**
 * Da un nombre legible al recurso, en vez del que se deduzca de la ruta.
 *
 * Solo hace falta cuando la ruta no se explica sola.
 */
export const Auditar = (recurso: string) =>
  SetMetadata(RECURSO_AUDITORIA, recurso);
