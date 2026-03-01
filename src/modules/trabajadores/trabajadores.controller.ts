import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { CreateTrabajadorWithUserDto } from './dto/create-trabajador-with-user.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateUserForWorkerDto } from './dto/create-user-for-worker.dto';
import {
  DisableUserDto,
  UpdateUserPasswordDto,
  UpdateUserRolesDto,
} from './dto/user-management.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

interface AuthenticatedUserData {
  id: string;
  sub: string;
  username: string;
  email?: string;
  roles: Role[];
  fullName?: string;
}
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('trabajadores')
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear trabajador básico' })
  @ApiResponse({ status: 201, description: 'Trabajador creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async create(@Body() createTrabajadorDto: CreateTrabajadorDto) {
    console.log('🟢 DTO recibido:', createTrabajadorDto);
    return this.trabajadoresService.create(createTrabajadorDto);
  }

  @Post('with-user')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear trabajador con usuario de sistema (solo admin)',
  })
  @ApiResponse({
    status: 201,
    description: 'Trabajador y usuario creados exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo administradores pueden crear usuarios',
  })
  async createWithUser(
    @Body() createDto: CreateTrabajadorWithUserDto,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.createWithUser(createDto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({ summary: 'Obtener todos los trabajadores' })
  @ApiResponse({ status: 200, description: 'Lista de trabajadores' })
  findAll() {
    return this.trabajadoresService.findAll();
  }

  @Get('nombres/all')
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({
    summary:
      'Obtener solo nombres de todos los trabajadores (para autocomplete)',
  })
  @ApiResponse({ status: 200, description: 'Lista de nombres de trabajadores' })
  async findAllNames(): Promise<string[]> {
    return this.trabajadoresService.findAllNames();
  }

  @Get('buscar/autocomplete')
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({
    summary: 'Buscar trabajadores y devolver solo nombres (para autocomplete)',
  })
  @ApiResponse({
    status: 200,
    description: 'Nombres de trabajadores encontrados',
  })
  async buscarTrabajadoresNames(
    @Query('query') query: string,
  ): Promise<string[]> {
    return this.trabajadoresService.buscarTrabajadoresNames(query);
  }

  @Get('buscar')
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({ summary: 'Buscar trabajadores por nómina o CI' })
  @ApiResponse({ status: 200, description: 'Trabajadores encontrados' })
  async buscarTrabajadores(@Query('query') query: string) {
    return this.trabajadoresService.buscarTrabajadores(query);
  }

  // ⚠️ IMPORTANTE: Este endpoint DEBE ir ANTES de @Get(':id')
  @Get('completos')
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({
    summary: 'Obtener trabajadores completos (nomina, CI, puesto)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de trabajadores con nomina, CI y puesto',
    schema: {
      example: [
        { nomina: 'Juan Pérez', ci: '12345678', puesto: 'Ingeniero' },
        { nomina: 'María López', ci: '87654321', puesto: 'Supervisor' },
      ],
    },
  })
  async findAllCompletos() {
    return this.trabajadoresService.findAllCompletos();
  }

  // ⚠️ Este endpoint DEBE ir al FINAL porque captura cualquier string como :id
  @Get(':id')
  @Roles(Role.ADMIN, Role.TECNICO, Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.INSPECTOR)
  @ApiOperation({ summary: 'Obtener trabajador por ID' })
  @ApiResponse({ status: 200, description: 'Trabajador encontrado' })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  findOne(@Param('id') id: string) {
    return this.trabajadoresService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar trabajador' })
  @ApiResponse({
    status: 200,
    description: 'Trabajador actualizado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  update(@Param('id') id: string, @Body() updateTrabajadorDto: any) {
    return this.trabajadoresService.update(id, updateTrabajadorDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar trabajador' })
  @ApiResponse({
    status: 200,
    description: 'Trabajador eliminado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  remove(@Param('id') id: string) {
    return this.trabajadoresService.remove(id);
  }

  @Post(':id/create-user')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear usuario del sistema para trabajador existente',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado y asociado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo administradores pueden crear usuarios',
  })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'El trabajador ya tiene usuario o username ya está en uso',
  })
  async createUserForExistingWorker(
    @Param('id') id: string,
    @Body() createUserDto: CreateUserForWorkerDto,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.createUserForExistingWorker(
      id,
      createUserDto,
      user,
    );
  }

  @Patch(':id/user/password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar contraseña de usuario del trabajador' })
  async updateWorkerUserPassword(
    @Param('id') id: string,
    @Body() updatePasswordDto: UpdateUserPasswordDto,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.updateWorkerUserPassword(
      id,
      updatePasswordDto,
      user,
    );
  }

  @Patch(':id/user/roles')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar roles del usuario del trabajador' })
  async updateWorkerUserRoles(
    @Param('id') id: string,
    @Body() updateRolesDto: UpdateUserRolesDto,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.updateWorkerUserRoles(
      id,
      updateRolesDto,
      user,
    );
  }

  @Patch(':id/user/disable')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario del trabajador' })
  async disableWorkerUser(
    @Param('id') id: string,
    @Body() disableDto: DisableUserDto,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.disableWorkerUser(id, disableDto, user);
  }

  @Patch(':id/user/enable')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activar usuario del trabajador' })
  async enableWorkerUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.enableWorkerUser(id, user);
  }

  @Delete(':id/user')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desvincular usuario del trabajador' })
  async unlinkWorkerUser(
    @Param('id') id: string,
    @Body() reason: { reason: string },
    @CurrentUser() user: AuthenticatedUserData,
  ) {
    return this.trabajadoresService.unlinkWorkerUser(id, reason.reason, user);
  }

  @Get(':id/user/info')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Obtener información del usuario del trabajador' })
  async getWorkerUserInfo(@Param('id') id: string) {
    return this.trabajadoresService.getWorkerUserInfo(id);
  }
}
