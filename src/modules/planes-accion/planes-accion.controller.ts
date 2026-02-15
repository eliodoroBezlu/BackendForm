import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  UseGuards
} from '@nestjs/common';
import { PlanesAccionService } from './planes-accion.service';
import { ApiOperation, ApiQuery, ApiTags, ApiParam } from '@nestjs/swagger';
import { CreatePlanAccionDto } from './dto/create-planes-accion.dto';
import { UpdatePlanAccionDto } from './dto/update-planes-accion.dto';
import { AddTareaDto } from './dto/add-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { Resource } from 'nest-keycloak-connect';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@ApiTags('planes-accion')
@Controller('planes-accion')
export class PlanesAccionController {
  constructor(private readonly planesAccionService: PlanesAccionService) {}

  // ==========================================
  // GENERACIÓN AUTOMÁTICA
  // ==========================================

  /**
   * 🔥 Generar UN PLAN con múltiples tareas desde una inspección
   */
  @Post('generar-desde-instancia/:instanceId')
  @ApiOperation({ 
    summary: 'Generar plan de acción automáticamente desde una inspección',
    description: 'Crea UN PLAN con múltiples tareas basadas en observaciones de la inspección. Los datos organizacionales se extraen automáticamente.'
  })
  @ApiQuery({ name: 'incluirPuntaje3', required: false, type: Boolean })
  @ApiQuery({ name: 'incluirSoloConComentario', required: false, type: Boolean })
  async generarPlanDesdeInstancia(
    @Param('instanceId') instanceId: string,
    @Query('incluirPuntaje3') incluirPuntaje3?: string,
    @Query('incluirSoloConComentario') incluirSoloConComentario?: string,
  ) {
    const opciones = {
      incluirPuntaje3: incluirPuntaje3 === 'true',
      incluirSoloConComentario: incluirSoloConComentario !== 'false', // true por defecto
    };

    return await this.planesAccionService.generarPlanDesdeInstancia(
      instanceId,
      opciones
    );
  }

  // ==========================================
  // CRUD DE PLANES
  // ==========================================

  @Post()
  @ApiOperation({ summary: 'Crear un plan de acción manualmente' })
  create(@Body() createDto: CreatePlanAccionDto) {
    return this.planesAccionService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los planes de acción' })
  @ApiQuery({ name: 'estado', required: false, enum: ['abierto', 'en-progreso', 'cerrado'] })
  @ApiQuery({ name: 'vicepresidencia', required: false })
  @ApiQuery({ name: 'superintendencia', required: false })
  @ApiQuery({ name: 'areaFisica', required: false })
  findAll(
    @Query('estado') estado?: string,
    @Query('vicepresidencia') vicepresidencia?: string,
    @Query('superintendencia') superintendencia?: string,
    @Query('areaFisica') areaFisica?: string,
  ) {
    const filters: any = {};
    if (estado) filters.estado = estado;
    if (vicepresidencia) filters.vicepresidencia = vicepresidencia;
    if (superintendencia) filters.superintendencia = superintendencia;
    if (areaFisica) filters.areaFisica = areaFisica;

    return this.planesAccionService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas globales de planes' })
  getStats() {
    return this.planesAccionService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un plan de acción por ID' })
  findOne(@Param('id') id: string) {
    return this.planesAccionService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos organizacionales del plan' })
  update(@Param('id') id: string, @Body() updateDto: UpdatePlanAccionDto) {
    return this.planesAccionService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un plan completo (y todas sus tareas)' })
  remove(@Param('id') id: string) {
    return this.planesAccionService.remove(id);
  }

  // ==========================================
  // OPERACIONES DE TAREAS
  // ==========================================

  @Post(':planId/tareas')
  @ApiOperation({ summary: 'Agregar una nueva tarea a un plan existente' })
  @ApiParam({ name: 'planId', description: 'ID del plan' })
  addTarea(
    @Param('planId') planId: string,
    @Body() addTareaDto: AddTareaDto,
  ) {
    return this.planesAccionService.addTarea(planId, addTareaDto);
  }

  @Patch(':planId/tareas/:tareaId')
  @ApiOperation({ summary: 'Actualizar una tarea específica' })
  @ApiParam({ name: 'planId', description: 'ID del plan' })
  @ApiParam({ name: 'tareaId', description: 'ID de la tarea' })
  updateTarea(
    @Param('planId') planId: string,
    @Param('tareaId') tareaId: string,
    @Body() updateTareaDto: UpdateTareaDto,
  ) {
    return this.planesAccionService.updateTarea(planId, tareaId, updateTareaDto);
  }

  @Delete(':planId/tareas/:tareaId')
  @ApiOperation({ summary: 'Eliminar una tarea específica' })
  @ApiParam({ name: 'planId', description: 'ID del plan' })
  @ApiParam({ name: 'tareaId', description: 'ID de la tarea' })
  deleteTarea(
    @Param('planId') planId: string,
    @Param('tareaId') tareaId: string,
  ) {
    return this.planesAccionService.deleteTarea(planId, tareaId);
  }

  @Patch(':planId/tareas/:tareaId/aprobar')
  @ApiOperation({ summary: 'Aprobar una tarea cerrada' })
  @ApiParam({ name: 'planId', description: 'ID del plan' })
  @ApiParam({ name: 'tareaId', description: 'ID de la tarea' })
  approveTarea(
    @Param('planId') planId: string,
    @Param('tareaId') tareaId: string,
  ) {
    return this.planesAccionService.approveTarea(planId, tareaId);
  }
}