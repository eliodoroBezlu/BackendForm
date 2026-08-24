import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { Role } from '../../modules/auth/enums/role.enum';
import { SinAuditoria } from './auditoria.decorators';

/**
 * Consulta de la bitácora. **Solo lectura y solo admin**: quien puede ver qué
 * hizo cada uno es un dato sensible, y quien pudiera modificarla la volvería
 * inútil.
 */
@ApiTags('Auditoría')
@Controller('auditoria')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@SinAuditoria()
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  async buscar(
    @Query('usuario') usuario?: string,
    @Query('recurso') recurso?: string,
    @Query('metodo') metodo?: string,
    @Query('documentoId') documentoId?: string,
    @Query('soloFallos') soloFallos?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('pagina') pagina?: string,
    @Query('porPagina') porPagina?: string,
  ) {
    return this.auditoria.buscar({
      usuario,
      recurso,
      metodo,
      documentoId,
      soloFallos: soloFallos === 'true',
      desde,
      hasta,
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
    });
  }

  /** Valores existentes, para llenar los desplegables de filtro. */
  @Get('filtros')
  async filtros() {
    const [recursos, usuarios] = await Promise.all([
      this.auditoria.recursos(),
      this.auditoria.usuarios(),
    ]);
    return { recursos, usuarios };
  }
}
