import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PrestamosSpccService, Actor } from './prestamos-spcc.service';
import { PrestamosReportesService } from './prestamos-reportes.service';
import { PrestamosPdfService } from './prestamos-pdf.service';
import {
  CancelarDto,
  CorregirSolicitanteDto,
  CrearSolicitudDto,
  DevolverDto,
  EntregarDto,
} from './dto/prestamos.dto';
import { EstadoSolicitud } from './schemas/solicitud-prestamo.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { Auditar } from '../../common/auditoria/auditoria.decorators';

/**
 * Préstamo de SPCC.
 *
 * **Quién puede qué**: piden supervisor y superintendente; entregar, devolver
 * y cancelar son del admin, que es quien tiene el almacén. Los tres ven el
 * módulo.
 */
@ApiTags('Préstamos SPCC')
@Controller('prestamos-spcc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Auditar('prestamos-spcc')
export class PrestamosSpccController {
  constructor(
    private readonly servicio: PrestamosSpccService,
    private readonly reportes: PrestamosReportesService,
    private readonly pdf: PrestamosPdfService,
  ) {}

  private actor(req: Request): Actor {
    const usuario = (
      req as Request & {
        user?: { username?: string; fullName?: string; roles?: string[] };
      }
    ).user;

    // Quien puede atribuir una solicitud a otra persona se decide aqui, donde
    // se conocen los roles, y no en el servicio.
    const roles = usuario?.roles ?? [];
    const puedeElegirSolicitante =
      roles.includes(Role.ADMIN) || roles.includes(Role.SUPERINTENDENTE);

    return {
      usuario: usuario?.username ?? 'desconocido',
      nombre: usuario?.fullName ?? undefined,
      puedeElegirSolicitante,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  @Get('disponibles')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async disponibles(@Query('tipo') tipo?: string) {
    return this.servicio.disponibles(tipo);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async listar(
    @Query('estado') estado?: EstadoSolicitud,
    @Query('area') area?: string,
    @Query('solicitante') solicitante?: string,
  ) {
    return this.servicio.listar({ estado, area, solicitante });
  }

  // ── Reportes ───────────────────────────────────────────────────────────
  // Declarados **antes** de `:id`: si fueran después, Nest tomaría
  // «reportes» como un identificador de solicitud.

  /** Mapa código → área, para etiquetar el selector de inspección. */
  @Get('prestados-ahora')
  @Roles(
    Role.ADMIN,
    Role.SUPERINTENDENTE,
    Role.SUPERVISOR,
    Role.TECNICO,
    Role.INSPECTOR,
  )
  async prestadosAhora() {
    return this.servicio.prestadosAhora();
  }

  @Get('reportes/resumen')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async resumen() {
    const libres = await this.servicio.disponibles();
    return this.reportes.resumen(libres.length);
  }

  @Get('reportes/vencidos')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async vencidos() {
    return this.reportes.vencidos();
  }

  @Get('reportes/por-area')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async porArea() {
    return this.reportes.porArea();
  }

  @Get('reportes/mas-prestados')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async masPrestados() {
    return this.reportes.masPrestados();
  }

  @Get('reportes/sin-inspeccion')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async sinInspeccion() {
    return this.reportes.sinInspeccion();
  }

  @Get('reportes/historial/:codigo')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async historial(@Param('codigo') codigo: string) {
    return this.reportes.historialEquipo(codigo);
  }

  @Get(':id/acta')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async acta(@Param('id') id: string, @Res() res: Response) {
    const solicitud = await this.servicio.buscar(id);
    const items = await this.servicio.lineas(id);
    const buffer = await this.pdf.generarActa(solicitud, items);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="acta-${solicitud.numero}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async detalle(@Param('id') id: string) {
    const solicitud = await this.servicio.buscar(id);
    const items = await this.servicio.lineas(id);
    return { solicitud, items };
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async crear(@Body() dto: CrearSolicitudDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Patch(':id/entregar')
  @Roles(Role.ADMIN)
  async entregar(
    @Param('id') id: string,
    @Body() dto: EntregarDto,
    @Req() req: Request,
  ) {
    return this.servicio.entregar(id, dto, this.actor(req));
  }

  @Patch(':id/devolver')
  @Roles(Role.ADMIN)
  async devolver(
    @Param('id') id: string,
    @Body() dto: DevolverDto,
    @Req() req: Request,
  ) {
    return this.servicio.devolver(id, dto, this.actor(req));
  }

  @Patch(':id/cancelar')
  @Roles(Role.ADMIN)
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarDto,
    @Req() req: Request,
  ) {
    return this.servicio.cancelar(id, dto, this.actor(req));
  }

  /**
   * Corrige a quien pertenece una solicitud ya registrada.
   *
   * Solo administracion, y **sin limite de estado**: las mal atribuidas que
   * hay que arreglar son justamente las viejas, ya entregadas y firmadas. El
   * valor anterior no se pierde: queda en `correcciones` y el acta lo muestra.
   */
  @Patch(':id/solicitante')
  @Roles(Role.ADMIN)
  async corregirSolicitante(
    @Param('id') id: string,
    @Body() dto: CorregirSolicitanteDto,
    @Req() req: Request,
  ) {
    return this.servicio.corregirSolicitante(id, dto, this.actor(req));
  }
}
