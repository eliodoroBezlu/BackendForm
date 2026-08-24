import { createParamDecorator, ExecutionContext, Logger } from '@nestjs/common';

// Un decorador de parametro no es una clase, asi que el logger es de modulo.
const logger = new Logger('CurrentUser');

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
      logger.warn('No hay usuario en el request');
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
