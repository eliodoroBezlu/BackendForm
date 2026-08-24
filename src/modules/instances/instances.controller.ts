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
  Logger,
} from '@nestjs/common';

import { Response } from 'express';
import { InstancesService } from './instances.service';
import { InstancesDocumentService } from './instances-document.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateInstanceDto } from './dto/update-instance.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  buildInspectionFilename,
  buildContentDispositionHeader,
} from '../../common/utils/download-filename.util';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  private readonly logger = new Logger(InstancesController.name);

  constructor(
    private readonly instancesService: InstancesService,
    private readonly documentService: InstancesDocumentService,
    private readonly bulkDownloadService: BulkDownloadService,
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

  // Debe ir ANTES de @Get(':id'): esa ruta captura cualquier cadena de un
  // segmento, asi que aqui abajo «compliance-report» era inalcanzable.
  @Get('compliance-report')
  @ApiOperation({
    summary: 'Obtener reporte detallado de cumplimiento',
    description:
      'Análisis por secciones con identificación de áreas problemáticas',
  })
  async getComplianceReport(@Query('templateId') templateId?: string) {
    return await this.instancesService.getComplianceReport(templateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una instancia por ID' })
  @ApiResponse({ status: 200, description: 'Instancia encontrada' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  async findOne(@Param('id') id: string) {
    return await this.instancesService.findOne(id);
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

    await this.bulkDownloadService.streamZip(
      res,
      ids,
      format,
      async (id, fmt) => {
        const inspeccion = await this.instancesService.findOne(id);
        if (!inspeccion) return null;

        const contenido =
          fmt === 'pdf'
            ? await this.documentService.generarPdfStream(inspeccion)
            : await this.documentService.generarDocumento(inspeccion);
        if (!contenido) return null;

        const { nombre, area, inspector, fecha } =
          this.documentService.resolverDatosArchivo(inspeccion);
        const filename = buildInspectionFilename(
          nombre,
          area,
          inspector,
          fecha,
          fmt === 'excel' ? 'xlsx' : 'pdf',
        );

        return { content: contenido, filename };
      },
    );
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

      const buffer = await this.documentService.generarDocumento(inspeccion);

      if (!buffer) {
        // Si no encuentra ningún servicio compatible
        return res.status(400).json({
          message: `No se encontró un generador de Excel para el template: ${templateCode} - ${template.name}`,
          templateCode: templateCode,
          templateName: template.name,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.documentService.resolverDatosArchivo(inspeccion);
      const filename = buildInspectionFilename(
        nombre,
        area,
        inspector,
        fecha,
        'xlsx',
      );

      this.logger.log(`Excel generado: ${filename}`);

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDispositionHeader(filename),
        'Content-Length': buffer.length.toString(),
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error(`Error al generar Excel: ${error}`);

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
      this.logger.debug(`Generando PDF de la instancia ${id}`);

      const inspeccion = await this.instancesService.findOne(id);
      if (!inspeccion) {
        return res.status(404).json({
          success: false,
          message: 'Instancia no encontrada',
        });
      }

      const template = inspeccion.templateId as any;
      const templateCode = template?.code?.toUpperCase() || '';

      const pdfStream = await this.documentService.generarPdfStream(inspeccion);

      if (!pdfStream) {
        return res.status(400).json({
          success: false,
          message: `No se puede generar PDF para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.documentService.resolverDatosArchivo(inspeccion);
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
        'Cache-Control': 'no-cache',
      });

      pdfStream.on('error', (err) => {
        this.logger.error(`❌ Error en el stream de PDF (instancia): ${err}`);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error al generar el archivo PDF',
          });
        } else {
          res.destroy();
        }
      });

      pdfStream.pipe(res);
    } catch (error) {
      this.logger.error(`❌ Error al generar PDF (instancia): ${error}`);
      res.status(500).json({
        success: false,
        message: 'Error al generar el archivo PDF',
        error: error.message,
      });
    }
  }
}
