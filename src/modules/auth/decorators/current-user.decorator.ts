import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorador para extraer el usuario autenticado del request.
 * 
 * Uso:
 * - @CurrentUser() user: User
 * - @CurrentUser('username') username: string
 * - @CurrentUser('roles') roles: Role[]
 * 
 * Reemplaza a @AuthenticatedUser() de Keycloak
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      console.warn('⚠️ [CurrentUser] No hay usuario en el request');
      return null;
    }

    // Si se especifica un campo, devolver solo ese campo
    if (data) {
      return user[data];
    }

    // Devolver el usuario completo
    return user;
  },
);