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
import { ExcelFrecuenteTecleService } from './excel-generator/frecuente-tecles.service';
import { ExcelPreUsoTecleService } from './excel-generator/preuso-tecle.service';
import { ExcelElementosIzajeService } from './excel-generator/elementos-izaje.service';
import { ExcelToPdfService } from './pdf/excel-to-pdf.service';
import { Resource } from 'nest-keycloak-connect';
@Resource ('inspections-herra-equipos')
@Resource ('inspections-herra-equipos')
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
    private readonly excelFrecuenteTecleService: ExcelFrecuenteTecleService,
    private readonly excelPreUsoTecleService: ExcelPreUsoTecleService,
    private readonly excelElementosIzajeService: ExcelElementosIzajeService,
    private readonly excelToPdfService: ExcelToPdfService,
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
      }else if( templateCode.includes('3.04.P37.F25')) {
        // Frecuente Tecle
         buffer = await this.excelFrecuenteTecleService.generateExcel(inspection);
         serviceUsed = 'FrecuenteTecleService';
      }else if( templateCode.includes('3.04.P37.F24')) {
        // Pre-Uso Tecle
         buffer = await this.excelPreUsoTecleService.generateExcel(inspection);
         serviceUsed = 'PreUsoTecleService';
      }else if( templateCode.includes('3.04.P37.F19')) {
        // Elementos de Izaje
         buffer = await this.excelElementosIzajeService .generateExcel(inspection);
         serviceUsed = 'ElementosIzajeService';
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
  @Get(':id/pdf')
async downloadPdf(@Param('id') id: string, @Res() res: Response) {
  try {
    console.log(`📄 Generando PDF para inspección ID: ${id}`);

    // 1. Buscar la inspección
    const inspection = await this.inspectionsService.findOne(id);

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: 'Inspección no encontrada',
      });
    }

    const templateCode = inspection.templateCode;

    // 2. PRIMERO generar el Excel (usando tu lógica existente)
    let excelBuffer: Buffer | null = null;
    
    if (templateCode.includes('1.02.P06.F37')) {
      excelBuffer = await this.excelManLiftService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P48.F03')) {
      excelBuffer = await this.excelVehicleService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F33')) {
      excelBuffer = await this.excelEscaleraService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P04.F35')) {
      excelBuffer = await this.excelGruaRemotoService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P04.F23')) {
      excelBuffer = await this.excelGruaCabinaService.generateExcel(inspection);
    } else if (templateCode.includes('2.03.P10.F05')) {
      excelBuffer = await this.excelTaladroService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F42')) {
      excelBuffer = await this.excelEquipoSoldarService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F40')) {
      excelBuffer = await this.excelEsmerilService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F39')) {
      excelBuffer = await this.excelAmoladoraService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F20')) {
      excelBuffer = await this.excelCilindrosService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F30')) {
      excelBuffer = await this.excelAndamiosService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F25')) {
      excelBuffer = await this.excelFrecuenteTecleService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F24')) {
      excelBuffer = await this.excelPreUsoTecleService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F19')) {
      excelBuffer = await this.excelElementosIzajeService.generateExcel(inspection);
    } else {
      return res.status(400).json({
        success: false,
        message: `No se puede generar PDF para el template: ${templateCode}`,
      });
    }

    if (!excelBuffer) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo generar el archivo Excel base',
      });
    }

    console.log(`📊 Excel generado, convirtiendo a PDF...`);

    // 3. Convertir Excel a PDF usando LibreOffice
    const pdfBuffer = await this.excelToPdfService.convertExcelToPdf(
      excelBuffer,
      { quality: 'high' }
    );

    // 4. Generar nombre del archivo
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `inspeccion-${templateCode}-${id}-${timestamp}.pdf`;

    console.log(`✅ PDF generado exitosamente: ${filename}`);

    // 5. Configurar respuesta para descarga
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error al generar PDF:', error);

    res.status(500).json({
      success: false,
      message: 'Error al generar el archivo PDF',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
}
