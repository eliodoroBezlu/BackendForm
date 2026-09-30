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
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PublicarRevisionDto } from '../../common/versionado/publicar-revision.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * Crear y editar la *estructura* de un formulario es de administración,
   * igual que en las plantillas de herramientas. Antes estos dos endpoints no
   * tenían `@Roles` y cualquier usuario autenticado podía cambiar una
   * plantilla.
   */
  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo template' })
  @ApiResponse({ status: 201, description: 'Template creado exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un template con este código',
  })
  create(
    @Body() createTemplateDto: CreateTemplateDto,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templatesService.create(createTemplateDto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los templates' })
  @ApiQuery({ name: 'type', required: false, enum: ['interna', 'externa'] })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'incluirBorradores', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista de templates' })
  findAll(
    @Query('type') type?: string,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
    @Query('incluirBorradores') incluirBorradores?: string,
  ) {
    return this.templatesService.findAll({
      type,
      isActive,
      search,
      incluirBorradores: incluirBorradores === 'true',
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de templates' })
  @ApiResponse({ status: 200, description: 'Estadísticas de templates' })
  getStats() {
    return this.templatesService.getStats();
  }

  /** Todas las revisiones de un código, de la más nueva a la más vieja. */
  @Get('code/:code/historial')
  @ApiOperation({ summary: 'Historial de revisiones de un template' })
  historial(@Param('code') code: string) {
    return this.templatesService.versionado.historial(code);
  }

  // ⚠️ IMPORTANTE: Este debe ir ANTES de @Get(':id')
  @Get('code/:code')
  @ApiOperation({ summary: 'Obtener un template por código' })
  @ApiResponse({ status: 200, description: 'Template encontrado' })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  findByCode(@Param('code') code: string) {
    return this.templatesService.findByCode(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un template por ID' })
  @ApiResponse({ status: 200, description: 'Template encontrado' })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  /** Si la revisión se puede editar en el lugar, y si no, por qué. */
  @Get(':id/estado-edicion')
  @ApiOperation({ summary: 'Si el template se puede editar' })
  estadoEdicion(@Param('id') id: string) {
    return this.templatesService.versionado.estadoEdicion(id);
  }

  /** Clona la revisión vigente como borrador de la siguiente. */
  @Post(':id/nueva-revision')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crear una nueva revisión (borrador)' })
  nuevaRevision(
    @Param('id') id: string,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templatesService.versionado.crearRevision(
      id,
      usuario ?? 'desconocido',
    );
  }

  /** El borrador pasa a vigente y la vigente anterior a obsoleta. */
  @Post(':id/publicar')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Publicar una revisión en borrador' })
  publicar(
    @Param('id') id: string,
    @Body() dto: PublicarRevisionDto,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templatesService.versionado.publicar(
      id,
      dto.motivoCambio,
      usuario ?? 'desconocido',
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Actualizar un template' })
  @ApiResponse({
    status: 200,
    description: 'Template actualizado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(id, updateTemplateDto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar un template' })
  @ApiResponse({
    status: 200,
    description: 'Template desactivado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  desactivate(@Param('id') id: string) {
    return this.templatesService.desactivate(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar un template' })
  @ApiResponse({ status: 200, description: 'Template eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  remove(@Param('id') id: string, @CurrentUser('username') usuario?: string) {
    return this.templatesService.remove(id, usuario ?? 'desconocido');
  }
}
