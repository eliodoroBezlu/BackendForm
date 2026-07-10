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
  UseGuards,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  buildInspectionFilename,
  buildContentDispositionHeader,
  dedupeFilename,
} from '../../common/utils/download-filename.util';
import archiver = require('archiver');

@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una instancia' })
  @ApiResponse({
    status: 200,
    description: 'Instancia actualizada exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  async update(
    @Param('id') id: string,
    @Body() updateInstanceDto: UpdateInstanceDto,
  ) {
    return await this.instancesService.update(id, updateInstanceDto);
  }

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

  /**
   * Resuelve el buffer de Excel correspondiente al templateCode de la
   * instancia, probando cada generador especializado. Reutilizado por
   * downloadExcel, downloadPdf y el endpoint de descarga masiva (ZIP).
   */
  private async generarExcelBuffer(
    inspeccion: any,
    templateCode: string,
    templateRevision: string,
  ): Promise<Buffer | null> {
    if (templateCode.includes('1.02.P06.F47')) {
      return this.calienteExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F45')) {
      return this.aislamientoExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F50')) {
      return this.izajeExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F51')) {
      return this.sustanciaExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F52')) {
      return this.electricActosExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F46')) {
      return templateRevision === '4'
        ? this.alturaV4ExcelService.generateExcel(inspeccion)
        : this.alturaExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F48')) {
      return this.confinadosExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F53')) {
      return this.electricCondicionesExcelService.generateExcel(inspeccion);
    } else if (templateCode.includes('1.02.P06.F12')) {
      return this.isopV7ExcelService.generateExcel(inspeccion);
    }
    return null;
  }

  /** Genera el documento final (Excel o PDF) para una instancia ya cargada. */
  private async generarDocumento(
    inspeccion: any,
    formato: 'excel' | 'pdf',
  ): Promise<Buffer | null> {
    const template = inspeccion.templateId;
    const templateCode = template?.code?.toUpperCase() || '';
    const templateRevision = template?.revision || '';
    const excelBuffer = await this.generarExcelBuffer(
      inspeccion,
      templateCode,
      templateRevision,
    );
    if (!excelBuffer) return null;
    if (formato === 'excel') return excelBuffer;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la instancia para el nombre de archivo. */
  private resolverDatosArchivo(inspeccion: any): {
    nombre: string;
    area: string;
    inspector: string;
    fecha: Date | string | undefined;
  } {
    const template = inspeccion.templateId;
    const vl = inspeccion.verificationList;
    const getVl = (key: string): string | undefined =>
      vl instanceof Map ? vl.get(key) : vl?.[key];
    const area =
      getVl('Área') || getVl('área') || getVl('area') || getVl('Area Física');
    const inspector = inspeccion.inspectionTeam?.[0]?.nombre;
    return {
      nombre: template?.name || template?.code || '',
      area: String(area || ''),
      inspector: String(inspector || ''),
      fecha: inspeccion.createdAt,
    };
  }

  @Post('bulk-download')
  async bulkDownload(
    @Body() body: { ids: string[]; format: 'pdf' | 'excel' },
    @Res() res: Response,
  ) {
    const { ids, format } = body || ({} as typeof body);

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Debe indicar al menos un id' });
    }
    if (format !== 'pdf' && format !== 'excel') {
      return res.status(400).json({
        success: false,
        message: 'Formato inválido: use "pdf" o "excel"',
      });
    }

    const zipFilename = `Inspecciones_${new Date().toISOString().slice(0, 10)}.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDispositionHeader(zipFilename),
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('❌ Error generando ZIP (instances):', err);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ success: false, message: 'Error al generar el ZIP' });
      }
    });
    archive.pipe(res);

    const usados = new Map<string, number>();
    const extension = format === 'excel' ? 'xlsx' : 'pdf';

    for (const id of ids) {
      try {
        const inspeccion = await this.instancesService.findOne(id);
        if (!inspeccion) continue;

        const buffer = await this.generarDocumento(inspeccion, format);
        if (!buffer) continue;

        const { nombre, area, inspector, fecha } =
          this.resolverDatosArchivo(inspeccion);
        const filename = buildInspectionFilename(
          nombre,
          area,
          inspector,
          fecha,
          extension,
        );
        archive.append(buffer, { name: dedupeFilename(filename, usados) });
      } catch (err) {
        console.error(`Error procesando instancia ${id} para el ZIP:`, err);
      }
    }

    await archive.finalize();
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    try {
      // 1. Buscar la instancia con template poblado
      const inspeccion = await this.instancesService.findOne(id);

      if (!inspeccion) {
        return res.status(404).json({ message: 'Inspección no encontrada' });
      }

      const template = inspeccion.templateId as any;
      const templateCode = template.code?.toUpperCase() || '';

      const buffer = await this.generarDocumento(inspeccion, 'excel');

      if (!buffer) {
        // Si no encuentra ningún servicio compatible
        return res.status(400).json({
          message: `No se encontró un generador de Excel para el template: ${templateCode} - ${template.name}`,
          templateCode: templateCode,
          templateName: template.name,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.resolverDatosArchivo(inspeccion);
      const filename = buildInspectionFilename(
        nombre,
        area,
        inspector,
        fecha,
        'xlsx',
      );

      console.log(`Excel generado exitosamente: ${filename}`);

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDispositionHeader(filename),
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

      const template = inspeccion.templateId as any;
      const templateCode = template?.code?.toUpperCase() || '';

      const pdfBuffer = await this.generarDocumento(inspeccion, 'pdf');

      if (!pdfBuffer) {
        return res.status(400).json({
          success: false,
          message: `No se puede generar PDF para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.resolverDatosArchivo(inspeccion);
      const filename = buildInspectionFilename(
        nombre,
        area,
        inspector,
        fecha,
        'pdf',
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDispositionHeader(filename),
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
