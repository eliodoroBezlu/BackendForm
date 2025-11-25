import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Res,
} from '@nestjs/common';

import e, { Response } from 'express';
import { InstancesService } from './instances.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateInstanceDto } from './dto/update-instance.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExcelCalienteService } from './excel-generator/excel-generator.service';
import { ExcelAislamientoervice } from './excel-generator/excel-generator-aislamiento.service';
import { ExcelIzajeService } from './excel-generator/excel-generator-izaje.service';
import { ExcelSustanciasService } from './excel-generator/excel-generator-sustancias.service';
import { ExcelElectricoActosService } from './excel-generator/excel-generator-electrcio-actos.service';
import { ExcelAlturav3Service } from './excel-generator/excel-generator-alturav3.service';
import { ExcelConfinadoService } from './excel-generator/excel-generator-confinado.service';
import { ExcelElectricoCondicionesService } from './excel-generator/excel-generator-electrcio-condiciones.service';
import { ExcelAlturav4Service } from './excel-generator/excel-generator-alturav4.service';
import { ExcelIsopV7Service } from './excel-generator/excel-generator-isop.service';
import { ExcelToPdfService } from '../inspection-herra-equipos/pdf/excel-to-pdf.service';
import { Resource } from 'nest-keycloak-connect';

@Resource('instances')
@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(
    private readonly instancesService: InstancesService,

    private readonly calienteExcelService: ExcelCalienteService,
    private readonly aislamientoExcelService: ExcelAislamientoervice,
    private readonly izajeExcelService: ExcelIzajeService,
    private readonly sustanciaExcelService: ExcelSustanciasService,
    private readonly electricActosExcelService: ExcelElectricoActosService,
    private readonly alturaExcelService: ExcelAlturav3Service,
    private readonly confinadosExcelService: ExcelConfinadoService,
    private readonly electricCondicionesExcelService: ExcelElectricoCondicionesService,
    private readonly alturaV4ExcelService: ExcelAlturav4Service,
    private readonly isopV7ExcelService: ExcelIsopV7Service,
    private readonly excelToPdfService: ExcelToPdfService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva instancia de formulario' })
  @ApiResponse({ status: 201, description: 'Instancia creada exitosamente' })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  create(@Body() createInstanceDto: CreateInstanceDto) {
    return this.instancesService.create(createInstanceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las instancias' })
  @ApiQuery({ name: 'templateId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['borrador', 'completado', 'revisado', 'aprobado'],
  })
  @ApiQuery({ name: 'createdBy', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: Date })
  @ApiQuery({ name: 'dateTo', required: false, type: Date })
  @ApiQuery({ name: 'area', required: false, type: String }) // ✅ NUEVO
  @ApiQuery({ name: 'superintendencia', required: false, type: String }) // ✅ NUEVO
  @ApiResponse({ status: 200, description: 'Lista de instancias' })
  async findAll(
    @Query('templateId') templateId?: string,
    @Query('status') status?: string,
    @Query('createdBy') createdBy?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('area') area?: string, // ✅ NUEVO
    @Query('superintendencia') superintendencia?: string, // ✅ NUEVO
    @Query('minCompliance', new DefaultValuePipe(0), ParseIntPipe)
    minCompliance?: number,
    @Query('maxCompliance', new DefaultValuePipe(100), ParseIntPipe)
    maxCompliance?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    const filters: any = {
      page,
      limit,
    };
    if (templateId) filters.templateId = templateId;
    if (status) filters.status = status;
    if (createdBy) filters.createdBy = createdBy;
    if (dateFrom) filters.dateFrom = new Date(dateFrom);
    if (dateTo) filters.dateTo = new Date(dateTo);
    if (area) filters.area = area; // ✅ NUEVO
    if (superintendencia) filters.superintendencia = superintendencia; // ✅ NUEVO
    if (minCompliance !== undefined) filters.minCompliance = minCompliance;
    if (maxCompliance !== undefined) filters.maxCompliance = maxCompliance;

    return await this.instancesService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de instancias' })
  @ApiQuery({ name: 'templateId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Estadísticas de instancias' })
  async getStats(@Query('templateId') templateId?: string) {
    return await this.instancesService.getStats(templateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una instancia por ID' })
  @ApiResponse({ status: 200, description: 'Instancia encontrada' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  async findOne(@Param('id') id: string) {
    return await this.instancesService.findOne(id);
  }

  @Get('compliance-report')
  @ApiOperation({
    summary: 'Obtener reporte detallado de cumplimiento',
    description:
      'Análisis por secciones con identificación de áreas problemáticas',
  })
  async getComplianceReport(@Query('templateId') templateId?: string) {
    return await this.instancesService.getComplianceReport(templateId);
  }

  // @Patch(':id')
  // @ApiOperation({ summary: 'Actualizar una instancia' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Instancia actualizada exitosamente',
  // })
  // @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  // async update(
  //   @Param('id') id: string,
  //   @Body() updateInstanceDto: UpdateInstanceDto,
  // ) {
  //   return await this.instancesService.update(id, updateInstanceDto);
  // }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de una instancia' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; userId?: string },
  ) {
    return this.instancesService.updateStatus(id, body.status, body.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.instancesService.remove(id);
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    try {
      // 1. Buscar la instancia con template poblado
      const inspeccion = await this.instancesService.findOne(id);

      if (!inspeccion) {
        return res.status(404).json({ message: 'Inspección no encontrada' });
      }

      // 2. Extraer información del template
      const template = inspeccion.templateId as any;
      const templateCode = template.code?.toUpperCase() || '';
      const templateRevision = template.revision || '';
      const templateName = template.name?.toUpperCase() || '';

      console.log(
        `Generando Excel para template: ${templateCode} - ${template.name}`,
      );

      // 3. Determinar qué servicio usar basado en el código/nombre del template
      let buffer: Buffer;
      let serviceUsed = '';

      if (templateCode.includes('1.02.P06.F47')) {
        buffer = await this.calienteExcelService.generateExcel(inspeccion);
        serviceUsed = 'CalienteExcelService';
      } else if (templateCode.includes('1.02.P06.F45')) {
        buffer = await this.aislamientoExcelService.generateExcel(inspeccion);
        serviceUsed = 'AislamientoExcelService';
      } else if (templateCode.includes('1.02.P06.F50')) {
        buffer = await this.izajeExcelService.generateExcel(inspeccion);
        serviceUsed = 'AislamientoExcelService';
      } else if (templateCode.includes('1.02.P06.F51')) {
        buffer = await this.sustanciaExcelService.generateExcel(inspeccion);
        serviceUsed = 'SustanciasExcelService';
      } else if (templateCode.includes('1.02.P06.F52')) {
        buffer = await this.electricActosExcelService.generateExcel(inspeccion);
        serviceUsed = 'ElectricExcelService';
      } else if (templateCode.includes('1.02.P06.F46')) {
        console.log(`Template Revision: ${templateRevision}`);
        if (templateRevision === '4') {
          buffer = await this.alturaV4ExcelService.generateExcel(inspeccion);
          serviceUsed = 'alturaV4ExcelService';
        } else {
          buffer = await this.alturaExcelService.generateExcel(inspeccion);
          serviceUsed = 'AlturaExcelService';
        }
      } else if (templateCode.includes('1.02.P06.F48')) {
        buffer = await this.confinadosExcelService.generateExcel(inspeccion);
        serviceUsed = 'ConfinadoExcelService';
      } else if (templateCode.includes('1.02.P06.F53')) {
        buffer =
          await this.electricCondicionesExcelService.generateExcel(inspeccion);
        serviceUsed = 'ElectricCondicionesExcelService';
      } else if (templateCode.includes('1.02.P06.F12')) {
        buffer = await this.isopV7ExcelService.generateExcel(inspeccion);
        serviceUsed = 'IsopV7ExcelService';
      } else {
        // Si no encuentra ningún servicio compatible
        return res.status(400).json({
          message: `No se encontró un generador de Excel para el template: ${templateCode} - ${template.name}`,
          templateCode: templateCode,
          templateName: template.name,
          availableServices: [
            'IRO, ISOLATION, AISLAMIENTO (IsolationExcelService)',
            // 'SAFETY, SEGURIDAD (SafetyExcelService)',
            // 'MAINT, MANTENIMIENTO (MaintenanceExcelService)',
          ],
        });
      }

      // 4. Generar nombre de archivo descriptivo
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `inspeccion-${templateCode || 'UNKNOWN'}-${id}-${timestamp}.xlsx`;

      console.log(`Excel generado exitosamente usando: ${serviceUsed}`);

      // 5. Configurar respuesta
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=${filename}`,
        'Content-Length': buffer.length.toString(),
      });

      res.send(buffer);
    } catch (error) {
      console.error('Error al generar Excel:', error);

      res.status(500).json({
        message: 'Error al generar el archivo Excel',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get(':id/pdf')
async downloadPdf(@Param('id') id: string, @Res() res: Response) {
  try {
    console.log(`📄 Generando PDF para instancia ID: ${id}`);

    const inspeccion = await this.instancesService.findOne(id);
    if (!inspeccion) {
      return res.status(404).json({
        success: false,
        message: 'Instancia no encontrada',
      });
    }

    // Extraer datos del template
    const template = inspeccion.templateId as any;
    const templateCode = template?.code?.toUpperCase() || '';

    // Generar Excel (misma lógica que en /:id/excel)
    let excelBuffer: Buffer;
    if (templateCode.includes('1.02.P06.F47')) {
      excelBuffer = await this.calienteExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F45')) {
      excelBuffer = await this.aislamientoExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F50')) {
      excelBuffer = await this.izajeExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F51')) {
      excelBuffer = await this.sustanciaExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F52')) {
      excelBuffer = await this.electricActosExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F46')) {
      const revision = template?.revision || '';
      excelBuffer = revision === '4'
        ? await this.alturaV4ExcelService.generateExcel(inspeccion)
        : await this.alturaExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F48')) {
      excelBuffer = await this.confinadosExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F53')) {
      excelBuffer = await this.electricCondicionesExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F12')) {
      excelBuffer = await this.isopV7ExcelService.generateExcel(inspeccion);
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

    // Convertir a PDF
    const pdfBuffer = await this.excelToPdfService.convertExcelToPdf(excelBuffer, { quality: 'high' });

    // Nombre del archivo
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `instancia-${templateCode || 'UNKNOWN'}-${id}-${timestamp}.pdf`;

    // Respuesta
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error al generar PDF (instancia):', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar el archivo PDF',
      error: error.message,
    });
  }
}
}
