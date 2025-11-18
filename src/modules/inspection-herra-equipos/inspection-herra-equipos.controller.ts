import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { CreateInspectionHerraEquipoDto } from './dto/create-inspection-herra-equipo.dto';
import { UpdateInspectionHerraEquipoDto } from './dto/update-inspection-herra-equipo.dto';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { ExcelVehicleService } from './excel-generator/vehicle.service';
import { Response } from 'express';
import { ExcelManLiftService } from './excel-generator/man-lift.service';
import { ExcelEscaleraService } from './excel-generator/escaleras.service';
import { ExcelGruaRemotoService } from './excel-generator/grua-remoto.service';
import { ExcelGruaCabinaService } from './excel-generator/grua-cabina.service';
import { ExcelTaladroService } from './excel-generator/taladro.service';
import { ExcelEquipoSoldarService } from './excel-generator/equipo-soldar.service';
import { ExcelEsmerilService } from './excel-generator/esmeril.service';
import { ExcelAmoladoraService } from './excel-generator/amoladora.service';
import { ExcelCilindrosService } from './excel-generator/cilindros.service';
import { ExcelAndamiosService } from './excel-generator/andamio.service';

@Controller('inspections-herra-equipos')
// @UseGuards(AuthGuard) // Si tienes autenticación
export class InspectionsHerraEquiposController {
  constructor(
    private readonly inspectionsService: InspectionsHerraEquiposService,
    private readonly excelVehicleService: ExcelVehicleService,
    private readonly excelManLiftService: ExcelManLiftService,
    private readonly excelEscaleraService: ExcelEscaleraService,
    private readonly excelGruaRemotoService: ExcelGruaRemotoService,
    private readonly excelGruaCabinaService: ExcelGruaCabinaService,
    private readonly excelTaladroService: ExcelTaladroService,
    private readonly excelEquipoSoldarService: ExcelEquipoSoldarService,
    private readonly excelEsmerilService: ExcelEsmerilService,
    private readonly excelAmoladoraService: ExcelAmoladoraService,
    private readonly excelCilindrosService: ExcelCilindrosService,
    private readonly excelAndamiosService: ExcelAndamiosService,
  ) {}

  // ============================================
  // POST /inspections-herra-equipos - Crear inspección
  // ============================================
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateInspectionHerraEquipoDto) {
    console.log('📥 Recibiendo nueva inspección herramientas/equipos:', {
      code: createDto.templateCode,
      status: createDto.status,
      hasScaffold: !!createDto.scaffold,
      hasVehicle: !!createDto.vehicle,
    });

    const inspection = await this.inspectionsService.create(createDto);

    return {
      success: true,
      message: 'Inspección de herramientas/equipos creada exitosamente',
      data: inspection,
    };
  }

  // ============================================
  // GET /inspections-herra-equipos - Listar inspecciones
  // ============================================
  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('templateCode') templateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('submittedBy') submittedBy?: string,
  ) {
    const inspections = await this.inspectionsService.findAll({
      status,
      templateCode,
      startDate,
      endDate,
      submittedBy,
    });

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }
  @Get('in-progress')
  async findInProgress(
    @Query('templateCode') templateCode?: string,
    @Query('submittedBy') submittedBy?: string,
  ) {
    console.log('📊 [CONTROLLER] Obteniendo inspecciones en progreso');

    const inspections = await this.inspectionsService.findInProgress({
      templateCode,
      submittedBy,
    });

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }
  // ============================================
  // GET /inspections-herra-equipos/drafts - Obtener borradores
  // ============================================
  @Get('drafts')
  async findDrafts(@Query('userId') userId?: string) {
    const drafts = await this.inspectionsService.findDrafts(userId);

    return {
      success: true,
      count: drafts.length,
      data: drafts,
    };
  }

  // ============================================
  // GET /inspections-herra-equipos/stats - Estadísticas
  // ============================================
  @Get('stats')
  async getStats(@Query('templateCode') templateCode?: string) {
    const stats = await this.inspectionsService.getStats(templateCode);

    return {
      success: true,
      data: stats,
    };
  }

  // ============================================
  // GET /inspections-herra-equipos/template/:code - Por código de template
  // ============================================
  @Get('template/:code')
  async findByTemplateCode(@Param('code') code: string) {
    const inspections = await this.inspectionsService.findByTemplateCode(code);

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }

  // ============================================
  // GET /inspections-herra-equipos/:id - Obtener una inspección
  // ============================================
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const inspection = await this.inspectionsService.findOne(id);

    return {
      success: true,
      data: inspection,
    };
  }

  // ============================================
  // PATCH /inspections-herra-equipos/:id - Actualizar inspección
  // ============================================
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateInspectionHerraEquipoDto,
  ) {
    console.log('🔄 Actualizando inspección herramientas/equipos:', id);

    const inspection = await this.inspectionsService.update(id, updateDto);

    return {
      success: true,
      message: 'Inspección actualizada exitosamente',
      data: inspection,
    };
  }

  // ============================================
  // DELETE /inspections-herra-equipos/:id - Eliminar inspección
  // ============================================
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.inspectionsService.remove(id);

    return {
      success: true,
      ...result,
    };
  }

  // ============================================
  // GET /inspections-herra-equipos/equipo/:nombre - Buscar por equipo
  // ============================================
  @Get('equipo/:nombre')
  async findByEquipo(@Param('nombre') nombre: string) {
    const inspections = await this.inspectionsService.findByEquipo(nombre);

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    try {
      console.log(`📊 Generando Excel para inspección de vehículo ID: ${id}`);

      // 1. Buscar la inspección
      const inspection = await this.inspectionsService.findOne(id);

      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspección no encontrada',
        });
      }

      // 2. Obtener datos del template
      const template = inspection.templateId as any;
      const templateCode = inspection.templateCode;
      const templateRevision = template?.revision;

      console.log(
        `🔍 Template Code: ${templateCode}, Revision: ${templateRevision}`,
      );

      // 3. Determinar qué servicio usar y generar Excel
      let buffer: Buffer | null = null;
      let serviceUsed = '';

      // ← CAMBIAR ESTA LÓGICA
      if (templateCode.includes('1.02.P06.F37')) {
        // Man Lift
        buffer = await this.excelManLiftService.generateExcel(inspection);
        serviceUsed = 'ManLiftService';
      } else if (templateCode.includes('3.04.P48.F03')) {
        // Vehículo
        buffer = await this.excelVehicleService.generateExcel(inspection);
        serviceUsed = 'VehicleService';
      }else if (templateCode.includes('1.02.P06.F33')) {
        
        // Escaleras
         buffer = await this.excelEscaleraService.generateExcel(inspection);
         serviceUsed = 'EscaleraService';
      }else if (templateCode.includes('3.04.P04.F35')) {
        // Grua Remoto
         buffer = await this.excelGruaRemotoService.generateExcel(inspection);
          serviceUsed = 'GruaRemotoService';
      }else if (templateCode.includes('3.04.P04.F23')) {
        // Grua Cabina
         buffer = await this.excelGruaCabinaService.generateExcel(inspection);
         serviceUsed = 'GruaCabinaService';
      }else if( templateCode.includes('2.03.P10.F05')) {
        // Taladro
         buffer = await this.excelTaladroService.generateExcel(inspection);
         serviceUsed = 'TaladroService';
      }else if( templateCode.includes('1.02.P06.F42')) {
        // Equipo Soldar
         buffer = await this.excelEquipoSoldarService.generateExcel(inspection);
         serviceUsed = 'EquipoSoldarService';
      }else if( templateCode.includes('1.02.P06.F40')) {
        // Esmeril
         buffer = await this.excelEsmerilService.generateExcel(inspection);
         serviceUsed = 'EsmerilService';
      }else if( templateCode.includes('1.02.P06.F39')) {
        // Amoladora
         buffer = await this.excelAmoladoraService.generateExcel(inspection);
         serviceUsed = 'AmoladoraService';
      }else if( templateCode.includes('1.02.P06.F20')) {
        // Cilindros
         buffer = await this.excelCilindrosService.generateExcel(inspection);
         serviceUsed = 'CilindrosService';
      }else if( templateCode.includes('1.02.P06.F30')) {
        // Andamios
         buffer = await this.excelAndamiosService.generateExcel(inspection);
         serviceUsed = 'AndamiosService';
      }
      else {
        // Template no soportado
        return res.status(400).json({
          success: false,
          message: `No se puede generar Excel para el template: ${templateCode}`,
          supportedTemplates: [
            '1.02.P06.F37 (Man Lift)',
            '3.04.P48.F03 (Vehículo)',
          ],
        });
      }

      if (!buffer) {
        return res.status(400).json({
          success: false,
          message: 'No se pudo generar el archivo Excel',
        });
      }

      // 4. Generar nombre del archivo
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `inspeccion-herraEquipos-${templateCode}-${id}-${timestamp}.xlsx`;

      console.log(
        `✅ Excel generado exitosamente: ${filename} usando ${serviceUsed}`,
      );

      // 5. Configurar respuesta para descarga
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache',
      });

      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);

      res.status(500).json({
        success: false,
        message: 'Error al generar el archivo Excel',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
