import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TipoCatalogoMonitoreo } from './domain/catalogos-iniciales';
import {
  ActualizarCatalogoMonitoreoDto,
  CrearCatalogoMonitoreoDto,
} from './dto/catalogo-monitoreo.dto';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { BombasService } from './bombas.service';
import { ImportadorPlanillaService } from './importacion/importador-planilla.service';

/** La planilla trae 21 bombas: 5 MB sobra y corta un archivo equivocado. */
const TAMANO_MAXIMO_PLANILLA = 5 * 1024 * 1024;

/**
 * Monitoreo de equipos de Confiabilidad (formato 2.03.P01.R09).
 *
 * **Todo el controlador exige `monitoreo_confiabilidad`**, y el
 * `RolesGuard` lo compara tal cual: ni admin entra sin el rol. Es lo pedido —
 * el área de Confiabilidad y quien se nombre expresamente, nadie más.
 */
@Controller('monitoreo-equipos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MONITOREO_CONFIABILIDAD)
export class MonitoreoEquiposController {
  constructor(
    private readonly catalogos: MonitoreoCatalogosService,
    private readonly bombas: BombasService,
    private readonly importador: ImportadorPlanillaService,
  ) {}

  // ── Catálogos ───────────────────────────────────────────────────────────

  @Get('catalogos')
  listarCatalogos(
    @Query('tipo', new ParseEnumPipe(TipoCatalogoMonitoreo, { optional: true }))
    tipo?: TipoCatalogoMonitoreo,
    @Query('incluirBajas') incluirBajas?: string,
  ) {
    return this.catalogos.listar(tipo, incluirBajas === 'true');
  }

  @Post('catalogos')
  crearCatalogo(@Body() dto: CrearCatalogoMonitoreoDto) {
    return this.catalogos.crear(dto);
  }

  /** Llena los catálogos vacíos y crea la ficha «Bomba». Se puede repetir. */
  @Post('catalogos/sembrar')
  sembrarCatalogos() {
    return this.catalogos.sembrar();
  }

  @Patch('catalogos/:id')
  actualizarCatalogo(
    @Param('id') id: string,
    @Body() dto: ActualizarCatalogoMonitoreoDto,
  ) {
    return this.catalogos.actualizar(id, dto);
  }

  @Delete('catalogos/:id')
  darDeBajaCatalogo(
    @Param('id') id: string,
    @CurrentUser('username') usuario: string,
  ) {
    return this.catalogos.darDeBaja(id, usuario);
  }

  @Patch('catalogos/:id/restaurar')
  restaurarCatalogo(@Param('id') id: string) {
    return this.catalogos.restaurar(id);
  }

  // ── Bombas ──────────────────────────────────────────────────────────────

  @Get('bombas')
  listarBombas() {
    return this.bombas.listar();
  }

  @Get('bombas/:tag')
  fichaBomba(@Param('tag') tag: string) {
    return this.bombas.ficha(tag);
  }

  /**
   * Sube la planilla de carga. **Sin `?aplicar=true` solo la revisa** y
   * responde qué haría; con él la escribe, salvo que haya problemas graves.
   */
  @Post('bombas/planilla')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: TAMANO_MAXIMO_PLANILLA } }),
  )
  importarPlanilla(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('aplicar') aplicar: string | undefined,
    @CurrentUser('username') usuario: string,
  ) {
    if (!file) {
      throw new BadRequestException('Falta la planilla (campo «file»)');
    }
    return this.importador.importar(file.buffer, {
      aplicar: aplicar === 'true',
      usuario,
    });
  }
}
