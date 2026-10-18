import { Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ServicioFormulariosService } from './servicio-formularios.service';

interface UsuarioDeSesion {
  id: string;
  username?: string | null;
  roles?: string[];
}

/**
 * Token para hablar con el servicio de formularios. Lo pide cualquier usuario
 * con sesión (la autenticación global ya lo exige): lo que puede hacer en el
 * servicio lo deciden los roles que van dentro del token.
 */
@Controller('servicio-formularios')
export class ServicioFormulariosController {
  constructor(private readonly servicio: ServicioFormulariosService) {}

  @Post('token')
  @HttpCode(200)
  emitirToken(@CurrentUser() usuario: UsuarioDeSesion) {
    return this.servicio.emitirToken({
      id: usuario.id,
      username: usuario.username,
      roles: usuario.roles ?? [],
    });
  }
}
