import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { ES_PUBLICO } from './publico.decorator';

/**
 * Guard de autenticación global.
 *
 * Se registra como `APP_GUARD`, de modo que **toda** ruta exige un JWT válido
 * salvo que esté marcada con `@Publico()`.
 *
 * Convive sin problema con los `@UseGuards(JwtAuthGuard, RolesGuard)` que ya
 * declaran los controladores: passport revalida el token y el resultado es el
 * mismo. Esos decoradores pueden retirarse gradualmente, pero no hace falta
 * tocarlos para que esto funcione.
 */
@Injectable()
export class AutenticacionGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (esPublico) return true;

    return super.canActivate(context);
  }
}
