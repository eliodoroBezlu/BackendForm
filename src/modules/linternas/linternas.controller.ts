import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { LinternasService } from './linternas.service';
import { LinternasPdfService } from './linternas-pdf.service';
import { LinternasReportesService } from './linternas-reportes.service';
import { StockLinternasService } from './stock-linternas.service';
import { RegistrarEntregaDto } from './dto/registrar-entrega.dto';
import {
  AnularEntregaDto,
  CorregirEntregaDto,
  ReclasificarEntregaDto,
} from './dto/corregir-entrega.dto';
import {
  FirmarReciboDto,
  RegistrarIngresoDto,
  ResolverPerdidaDto,
} from './dto/resolver-perdida.dto';
import { EstadoEntrega, TipoEntrega } from './schemas/entrega-linterna.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { ContextoFirma } from '../../common/firma/firma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('linternas')
@Controller('linternas')
export class LinternasController {
  constructor(
    private readonly linternas: LinternasService,
    private readonly stock: StockLinternasService,
    private readonly reportes: LinternasReportesService,
    private readonly pdf: LinternasPdfService,
  ) {}

  /**
   * La IP y el user-agent se toman del request, no del cuerpo: son parte de la
   * evidencia de la firma y el cliente no debe poder dictarlas.
   */
  private contexto(req: Request, usuario: string): ContextoFirma {
    return {
      usuario,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  @Get()
  listar(
    @Query('area') area?: string,
    @Query('tipo') tipo?: TipoEntrega,
    @Query('estado') estado?: EstadoEntrega,
  ) {
    return this.linternas.listar({ area, tipo, estado });
  }

  @Get('pendientes')
  @Roles(Role.SUPERINTENDENTE, Role.SUPERVISOR, Role.ADMIN)
  pendientes() {
    return this.linternas.pendientesDeAprobacion();
  }

  @Get('sin-dotacion')
  sinDotacion() {
    return this.linternas.sinDotacion();
  }

  @Get('stock')
  async verStock() {
    return {
      cantidadDisponible: await this.stock.disponible(),
      ingresos: await this.stock.historialIngresos(),
    };
  }

  // ── Reportes ────────────────────────────────────────────────────────────
  // Van antes de `trabajador/:id` porque Nest resuelve por orden de
  // declaración y `:id` se tragaría cualquier segmento.

  @Get('reportes/resumen')
  resumen() {
    return this.reportes.resumen();
  }

  @Get('reportes/por-area')
  porArea() {
    return this.reportes.porArea();
  }

  @Get('reportes/por-trabajador')
  porTrabajador() {
    return this.reportes.porTrabajador();
  }

  @Get('reportes/perdidas')
  perdidas(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.reportes.perdidas(desde, hasta);
  }

  @Get('trabajador/:id')
  estadoTrabajador(@Param('id') id: string) {
    return this.linternas.estadoDeTrabajador(id);
  }

  @Get('trabajador/:id/historial')
  historial(@Param('id') id: string) {
    return this.linternas.historialDeTrabajador(id);
  }

  /** Acta imprimible, el equivalente al papel que se archivaba. */
  @Get(':id/acta')
  async acta(@Param('id') id: string, @Res() res: Response) {
    const entrega = await this.linternas.buscarPorId(id);
    if (!entrega) throw new NotFoundException('La entrega no existe.');

    const pdf = await this.pdf.generarActa(entrega);
    const nombre = `acta-linterna-${entrega.nombreTrabajador
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()}-${String(entrega._id).slice(-6)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  // ── Escritura ───────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  registrar(
    @Body() dto: RegistrarEntregaDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.registrar(dto, this.contexto(req, usuario));
  }

  @Post('stock/ingreso')
  @Roles(Role.ADMIN)
  registrarIngreso(
    @Body() dto: RegistrarIngresoDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.stock.registrarIngreso(dto.cantidad, usuario, dto.observacion);
  }

  /**
   * Aprobar no está en manos de quien entrega: si fuera el mismo rol, la
   * autorización no controlaría nada.
   */
  @Patch(':id/resolver')
  @Roles(Role.SUPERINTENDENTE, Role.SUPERVISOR)
  resolver(
    @Param('id') id: string,
    @Body() dto: ResolverPerdidaDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.resolverPerdida(id, dto, this.contexto(req, usuario));
  }

  /**
   * Corrige la observacion de una entrega aun sin firmar.
   *
   * Para cambiar el tipo esta `reclasificar`; para dejarla sin efecto,
   * `anular`.
   */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE)
  corregir(
    @Param('id') id: string,
    @Body() dto: CorregirEntregaDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.corregir(id, dto, this.contexto(req, usuario));
  }

  /**
   * Anula una entrega que no debia registrarse.
   *
   * Solo administracion: dejar sin efecto un acta no es mantenimiento
   * corriente. El asiento se queda y sale de los recuentos de dotacion.
   */
  @Patch(':id/anular')
  @Roles(Role.ADMIN)
  anular(
    @Param('id') id: string,
    @Body() dto: AnularEntregaDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.anular(id, dto, this.contexto(req, usuario));
  }

  /**
   * Cambia el tipo de una entrega: de «cambio» a «perdida» y al reves.
   *
   * No es editar un campo. El tipo decide que exige la entrega, si descuenta
   * stock y en que estado nace, asi que se declara la entrega entera con las
   * reglas del tipo nuevo. Solo mientras no haya firma.
   */
  @Patch(':id/reclasificar')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE)
  reclasificar(
    @Param('id') id: string,
    @Body() dto: ReclasificarEntregaDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.reclasificar(id, dto, this.contexto(req, usuario));
  }

  @Patch(':id/firmar')
  @Roles(Role.ADMIN)
  firmar(
    @Param('id') id: string,
    @Body() dto: FirmarReciboDto,
    @CurrentUser('username') usuario: string,
    @Req() req: Request,
  ) {
    return this.linternas.firmarRecibo(id, dto, this.contexto(req, usuario));
  }
}
