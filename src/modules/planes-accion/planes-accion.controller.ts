import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { PlanesAccionService } from './planes-accion.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import { ApiOperation, ApiQuery, ApiTags, ApiParam } from '@nestjs/swagger';
import { CreatePlanAccionDto } from './dto/create-planes-accion.dto';
import { UpdatePlanAccionDto } from './dto/update-planes-accion.dto';
import { AddTareaDto } from './dto/add-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { AprobarPlanDto } from './dto/aprobar-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { buildContentDispositionHeader } from '../../common/utils/download-filename.util';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('planes-accion')
@Controller('planes-accion')
export class PlanesAccionController {
  constructor(
    private readonly planesAccionService: PlanesAccionService,
    private readonly planesAccionExcelService: PlanesAccionExcelService,
  ) {}

  // ==========================================
  // GENERACIÓN AUTOMÁTICA
  // ==========================================

  /**
   * 🔥 Generar UN PLAN con múltiples tareas desde una inspección
   */
  @Post('generar-desde-instancia/:instanceId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Generar plan de acción automáticamente desde una inspección',
    description:
      'Crea UN PLAN con múltiples tareas basadas en observaciones de la inspección. Los datos organizacionales se extraen automáticamente. Solo Admin.',
  })
  @ApiQuery({ name: 'incluirPuntaje3', required: false, type: Boolean })
  @ApiQuery({
    name: 'incluirSoloConComentario',
    required: false,
    type: Boolean,
  })
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
      opciones,
    );
  }

  // ==========================================
  // CRUD DE PLANES
  // ==========================================

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear un plan de acción manualmente (solo Admin)' })
  create(@Body() createDto: CreatePlanAccionDto) {
    return this.planesAccionService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los planes de acción' })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['abierto', 'en-progreso', 'cerrado'],
  })
  @ApiQuery({ name: 'vicepresidencia', required: false })
  @ApiQuery({ name: 'superintendencia', required: false })
  @ApiQuery({ name: 'areaFisica', required: false })
  findAll(
    @Query('estado') estado?: string,
    @Query('vicepresidencia') vicepresidencia?: string,
    @Query('superintendencia') superintendencia?: string,
    @Query('areaFisica') areaFisica?: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    const filters: any = {};
    if (estado) filters.estado = estado;
    if (vicepresidencia) filters.vicepresidencia = vicepresidencia;
    if (superintendencia) filters.superintendencia = superintendencia;
    if (areaFisica) filters.areaFisica = areaFisica;

    return this.planesAccionService.findAll(filters, roles);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas globales de planes' })
  getStats() {
    return this.planesAccionService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un plan de acción por ID' })
  findOne(@Param('id') id: string, @CurrentUser('roles') roles?: string[]) {
    return this.planesAccionService.findOne(id, roles);
  }

  @Patch(':id/aprobar-global')
  @Roles(Role.SUPERINTENDENTE, Role.ADMIN)
  @ApiOperation({
    summary:
      'Aprobación global del plan por el Superintendente (habilita su visibilidad para el Supervisor)',
  })
  aprobarGlobal(
    @Param('id') id: string,
    @Body() aprobarDto: AprobarPlanDto,
    @CurrentUser('username') username: string,
  ) {
    return this.planesAccionService.aprobarGlobal(id, username, aprobarDto);
  }

  @Get(':id/excel')
  @ApiOperation({
    summary:
      'Descargar el plan como Excel (plantilla oficial 1.02.P06.F41 Planilla de Seguimientos)',
  })
  async downloadExcel(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser('roles') roles?: string[],
  ) {
    try {
      const plan = await this.planesAccionService.findOne(id, roles);
      const buffer = await this.planesAccionExcelService.generarExcel(plan);

      const areaPart = (plan.areaFisica || 'Sin area').replace(
        /[\\/:*?"<>|]/g,
        '-',
      );
      const fecha = new Date().toISOString().slice(0, 10);
      const filename = `Planilla_Seguimientos_${areaPart}_${fecha}.xlsx`;

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDispositionHeader(filename),
        'Content-Length': buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error) {
      const status = error instanceof ForbiddenException ? 403 : 500;
      res.status(status).json({
        message:
          error instanceof Error
            ? error.message
            : 'Error al generar el Excel del plan',
      });
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar datos organizacionales del plan (solo Admin)',
  })
  update(@Param('id') id: string, @Body() updateDto: UpdatePlanAccionDto) {
    return this.planesAccionService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Dar de baja un plan completo (solo Admin)' })
  remove(@Param('id') id: string) {
    return this.planesAccionService.remove(id);
  }

  // ==========================================
  // OPERACIONES DE TAREAS
  // ==========================================

  @Post(':planId/tareas')
  @ApiOperation({ summary: 'Agregar una nueva tarea a un plan existente' })
  @ApiParam({ name: 'planId', description: 'ID del plan' })
  addTarea(@Param('planId') planId: string, @Body() addTareaDto: AddTareaDto) {
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
    return this.planesAccionService.updateTarea(
      planId,
      tareaId,
      updateTareaDto,
    );
  }

  @Delete(':planId/tareas/:tareaId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Dar de baja una tarea específica (solo Admin)' })
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
