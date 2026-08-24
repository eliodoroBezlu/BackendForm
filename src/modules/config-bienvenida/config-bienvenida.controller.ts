import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ConfigBienvenidaService } from './config-bienvenida.service';
import { ActualizarConfigBienvenidaDto } from './dto/actualizar-config-bienvenida.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { Publico } from '../../common/nucleo/publico.decorator';
import { Auditar } from '../../common/auditoria/auditoria.decorators';

/**
 * Pantalla de bienvenida: qué se ve mientras el sistema abre.
 *
 * Leer es anónimo y escribir es de administración. Esa asimetría es el módulo
 * entero.
 */
@ApiTags('Configuración de bienvenida')
@Controller('config-bienvenida')
@Auditar('config-bienvenida')
export class ConfigBienvenidaController {
  constructor(private readonly servicio: ConfigBienvenidaService) {}

  /**
   * **Pública a propósito.**
   *
   * Esta pantalla se dibuja *mientras* se valida la sesión, así que exigir un
   * token para saber qué texto pintar no tiene salida: haría falta el token
   * para enseñar la espera del token.
   *
   * Es seguro porque lo que devuelve es decoración —un saludo, una clave de
   * animación, unos consejos de seguridad—: nada que no pudiera ir impreso en
   * un cartel a la entrada de la planta. Si algún día se le añadiera algo
   * sensible, este endpoint deja de poder ser público.
   */
  @Get()
  @Publico()
  async obtener() {
    return this.servicio.obtener();
  }

  /**
   * Lo que ve quien configura: el documento tal cual, sin caducar el mensaje.
   * Si `GET /` le devolviera la versión ya filtrada, editar un aviso fuera de
   * plazo lo borraría sin querer al guardar.
   */
  @Get('crudo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE)
  async obtenerCrudo() {
    return this.servicio.obtenerCrudo();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE)
  async actualizar(
    @Body() dto: ActualizarConfigBienvenidaDto,
    @Req() req: Request,
  ) {
    const usuario =
      (req as Request & { user?: { username?: string } }).user?.username ??
      'desconocido';
    return this.servicio.actualizar(dto, usuario);
  }
}
