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

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo template' })
  @ApiResponse({ status: 201, description: 'Template creado exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un template con este código',
  })
  create(@Body() createTemplateDto: CreateTemplateDto) {
    return this.templatesService.create(createTemplateDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los templates' })
  @ApiQuery({ name: 'type', required: false, enum: ['interna', 'externa'] })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de templates' })
  findAll(
    @Query('type') type?: string,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
  ) {
    return this.templatesService.findAll({ type, isActive, search });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de templates' })
  @ApiResponse({ status: 200, description: 'Estadísticas de templates' })
  getStats() {
    return this.templatesService.getStats();
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

  @Patch(':id')
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
  remove(
    @Param('id') id: string,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templatesService.remove(id, usuario ?? 'desconocido');
  }
}
