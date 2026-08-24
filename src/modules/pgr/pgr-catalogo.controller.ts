import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PgrCatalogoService } from './pgr-catalogo.service';
import {
  ActualizarEntregableDto,
  ActualizarGrupoDto,
  ActualizarUnidadDto,
  CrearEntregableDto,
  CrearGrupoDto,
  CrearUnidadDto,
} from './dto/pgr-catalogo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Catálogos del PGR. Leer es para cualquiera autenticado —los formularios los
 * consultan al abrirse—; escribir es de administración.
 */
@ApiTags('pgr-catalogos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pgr/catalogos')
export class PgrCatalogoController {
  constructor(private readonly service: PgrCatalogoService) {}

  // ── Unidades de recurso ───────────────────────────────────────────────────

  @Get('unidades')
  @ApiOperation({ summary: 'Unidades de recurso activas (hoy: HH)' })
  listarUnidades(@Query('todas') todas?: string) {
    return this.service.listarUnidades(todas === 'true');
  }

  @Post('unidades')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  crearUnidad(@Body() dto: CrearUnidadDto) {
    return this.service.crearUnidad(dto);
  }

  @Patch('unidades/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  actualizarUnidad(@Param('id') id: string, @Body() dto: ActualizarUnidadDto) {
    return this.service.actualizarUnidad(id, dto);
  }

  // ── Entregables sugeridos ─────────────────────────────────────────────────

  @Get('entregables')
  listarEntregables() {
    return this.service.listarEntregables();
  }

  @Post('entregables')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  crearEntregable(@Body() dto: CrearEntregableDto) {
    return this.service.crearEntregable(dto.nombre);
  }

  @Patch('entregables/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  actualizarEntregable(
    @Param('id') id: string,
    @Body() dto: ActualizarEntregableDto,
  ) {
    return this.service.actualizarEntregable(id, dto);
  }

  // ── Grupos de responsables ────────────────────────────────────────────────

  @Get('grupos')
  @ApiOperation({
    summary: 'Grupos aplicables a una superintendencia, más los sin ámbito',
  })
  listarGrupos(@Query('superintendencia') superintendencia?: string) {
    return this.service.listarGrupos(superintendencia);
  }

  @Get('grupos/:id/miembros')
  @ApiOperation({
    summary: 'Trabajadores que quedan alcanzados al asignar el grupo',
  })
  miembros(@Param('id') id: string) {
    return this.service.miembrosDelGrupo(id);
  }

  @Post('grupos')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  crearGrupo(@Body() dto: CrearGrupoDto) {
    return this.service.crearGrupo(dto);
  }

  @Patch('grupos/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  actualizarGrupo(@Param('id') id: string, @Body() dto: ActualizarGrupoDto) {
    return this.service.actualizarGrupo(id, dto);
  }
}
