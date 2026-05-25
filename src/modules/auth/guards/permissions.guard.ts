import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../enums/permission.enum';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { getPermissionsForRoles } from '../enums/role-permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Obtener los permisos basados en los roles del usuario
    const rolePermissions = getPermissionsForRoles(user.roles || []);
    
    // Si el usuario tiene permisos directos configurados (opcional, en su schema)
    const userDirectPermissions = user.permissions || [];

    const allUserPermissions = new Set([
      ...rolePermissions,
      ...userDirectPermissions,
    ]);

    return requiredPermissions.some((permission) => allUserPermissions.has(permission));
  }
}
