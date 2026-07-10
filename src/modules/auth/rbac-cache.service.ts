/**
 * RbacCacheService — BackendForm
 * ──────────────────────────────────────────────────────────────────
 * Descarga y cachea el mapa RBAC del servicio 'forms' desde el IAM
 * (GET /api/rbac/forms), fuente de verdad centralizada. Computa los
 * permisos de un usuario desde sus roles usando ese mapa.
 *
 * Si el IAM no responde, cae al mapa local hardcodeado (role-permissions.ts)
 * para no romper la autorización.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getPermissionsForRoles } from './enums/role-permissions';
import { Role } from './enums/role.enum';

interface RbacMap {
  rolePermissions: Record<string, string[]>;
  permissionCatalog: string[];
  fetchedAt: number;
}

@Injectable()
export class RbacCacheService {
  private readonly logger = new Logger(RbacCacheService.name);
  private readonly TTL = 5 * 60 * 1000; // 5 min
  private readonly serviceKey = 'forms';
  private cache: RbacMap | null = null;

  constructor(private readonly config: ConfigService) {}

  private async loadMap(): Promise<RbacMap | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.TTL) return this.cache;

    const base = this.config.get<string>('IAM_CORE_URL', 'http://localhost:4000').replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/api/rbac/${this.serviceKey}`);
      if (res.ok) {
        const data = (await res.json()) as {
          rolePermissions?: Record<string, string[]>;
          permissionCatalog?: string[];
        };
        this.cache = {
          rolePermissions:   data.rolePermissions ?? {},
          permissionCatalog: data.permissionCatalog ?? [],
          fetchedAt:         Date.now(),
        };
        return this.cache;
      }
      this.logger.warn(`RBAC del IAM respondió ${res.status}; uso cache/local`);
    } catch (e) {
      this.logger.warn(`No se pudo obtener RBAC del IAM (${(e as Error).message}); uso cache/local`);
    }
    return this.cache; // puede ser null → fallback local
  }

  /** Computa los permisos efectivos de un usuario en forms desde sus roles. */
  async computePermissions(roles: string[]): Promise<string[]> {
    const map = await this.loadMap();
    if (!map) {
      // Fallback: mapa local hardcodeado (compatibilidad si el IAM no responde)
      return getPermissionsForRoles(roles as Role[]);
    }
    const set = new Set<string>();
    for (const r of roles) {
      const perms = map.rolePermissions[r];
      if (Array.isArray(perms)) perms.forEach((p) => set.add(p));
    }
    return Array.from(set);
  }
}
