import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { GerenciaService } from './gerencia.service';
import { CreateGerenciaDto } from './dto/create-gerencia.dto';
import { UpdateGerenciaDto } from './dto/update-gerencia.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Leer es para cualquiera autenticado —los formularios y selectores consultan
 * el catálogo—; escribir es de administración, igual que el resto de los
 * maestros organizacionales.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gerencias')
export class GerenciaController {
  constructor(private readonly gerenciaService: GerenciaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async create(
    @Body() createGerenciaDto: CreateGerenciaDto,
    @Request() req: { user?: { username?: string } },
  ) {
    return this.gerenciaService.create(
      createGerenciaDto,
      req.user?.username || 'Sistema',
    );
  }

  @Get('buscar')
  async buscar(@Query('query') query: string): Promise<string[]> {
    return this.gerenciaService.buscarGerencia(query);
  }

  @Get()
  async findAll() {
    return this.gerenciaService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.gerenciaService.findOne(id);
  }

  @Get(':id/superintendencias')
  async superintendencias(@Param('id') id: string) {
    return this.gerenciaService.superintendencias(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateGerenciaDto: UpdateGerenciaDto,
    @Request() req: { user?: { username?: string } },
  ) {
    return this.gerenciaService.update(
      id,
      updateGerenciaDto,
      req.user?.username || 'Sistema',
    );
  }

  @Put('desactivar/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async desactivar(
    @Param('id') id: string,
    @Request() req: { user?: { username?: string } },
  ) {
    return this.gerenciaService.desactivar(id, req.user?.username || 'Sistema');
  }

  @Put('activar/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async activar(
    @Param('id') id: string,
    @Request() req: { user?: { username?: string } },
  ) {
    return this.gerenciaService.activar(id, req.user?.username || 'Sistema');
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.gerenciaService.remove(id, usuario ?? 'desconocido');
  }
}
