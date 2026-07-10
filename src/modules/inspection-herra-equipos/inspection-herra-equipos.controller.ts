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
  Logger,
} from '@nestjs/common';
import { CreateInspectionHerraEquipoDto } from './dto/create-inspection-herra-equipo.dto';
import {
  UpdateInspectionHerraEquipoDto,
  ApproveInspectionDto,
  RejectInspectionDto,
} from './dto/update-inspection-herra-equipo.dto';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExcelArnestService } from './excel-generator/arnes.service';
import {
  buildInspectionFilename,
  buildContentDispositionHeader,
  dedupeFilename,
} from '../../common/utils/download-filename.util';
import archiver = require('archiver');

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inspections-herra-equipos')
export class InspectionsHerraEquiposController {
  private readonly logger = new Logger(InspectionsHerraEquiposController.name);

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
    private readonly excelArnestService: ExcelArnestService,
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
      requiresApproval: createDto.requiresApproval,
    });

    const inspection = await this.inspectionsService.create(createDto);

    return {
      success: true,
      message: 'Inspección de herramientas/equipos creada exitosamente',
      data: inspection,
    };
  }

  // ============================================
  // ✅ NUEVOS ENDPOINTS DE APROBACIÓN
  // ============================================

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveInspection(
    @Param('id') id: string,
    @Body() approveDto: ApproveInspectionDto,
  ) {
    console.log(`✅ Aprobando inspección ${id} por ${approveDto.approvedBy}`);

    const inspection = await this.inspectionsService.approveInspection(
      id,
      approveDto,
    );

    return {
      success: true,
      message: 'Inspección aprobada exitosamente',
      data: inspection,
    };
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectInspection(
    @Param('id') id: string,
    @Body() rejectDto: RejectInspectionDto,
  ) {
    console.log(`❌ Rechazando inspección ${id} por ${rejectDto.rejectedBy}`);

    const inspection = await this.inspectionsService.rejectInspection(
      id,
      rejectDto,
    );

    return {
      success: true,
      message: 'Inspección rechazada',
      data: inspection,
    };
  }

  @Get('pending-approvals')
  async findPendingApprovals(
    @Query('excludeSubmittedBy') excludeSubmittedBy?: string,
    @Query('areas') areasParam?: string, // CSV: "Chancado,Flotacion"
    @Query('isAdmin') isAdmin?: string,
  ) {
    // Parsear áreas desde CSV ("Chancado,Flotacion" → ["Chancado","Flotacion"])
    const areas = areasParam
      ? areasParam
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    this.logger.log(
      `📌 [CTRL] pending-approvals — áreas=[${areas.join(', ')}] | isAdmin=${isAdmin}`,
    );

    const inspections = await this.inspectionsService.findPendingApprovals({
      excludeSubmittedBy,
      areas,
      isAdmin: isAdmin === 'true',
    });

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }

  // ============================================
  // ENDPOINTS EXISTENTES
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

  @Get('drafts')
  async findDrafts(@Query('userId') userId?: string) {
    const drafts = await this.inspectionsService.findDrafts(userId);

    return {
      success: true,
      count: drafts.length,
      data: drafts,
    };
  }

  @Get('stats')
  async getStats(@Query('templateCode') templateCode?: string) {
    const stats = await this.inspectionsService.getStats(templateCode);

    return {
      success: true,
      data: stats,
    };
  }

  @Get('template/:code')
  async findByTemplateCode(@Param('code') code: string) {
    const inspections = await this.inspectionsService.findByTemplateCode(code);

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const inspection = await this.inspectionsService.findOne(id);

    return {
      success: true,
      data: inspection,
    };
  }

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

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.inspectionsService.remove(id);

    return {
      success: true,
      ...result,
    };
  }

  @Get('equipo/:nombre')
  async findByEquipo(@Param('nombre') nombre: string) {
    const inspections = await this.inspectionsService.findByEquipo(nombre);

    return {
      success: true,
      count: inspections.length,
      data: inspections,
    };
  }

  /**
   * Resuelve el buffer de Excel correspondiente al templateCode de la
   * inspección, probando cada generador especializado. Reutilizado por
   * downloadExcel, downloadPdf y el endpoint de descarga masiva (ZIP).
   */
  private async generarExcelBuffer(
    inspection: any,
    templateCode: string,
  ): Promise<Buffer | null> {
    if (templateCode.includes('1.02.P06.F37')) {
      return this.excelManLiftService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P48.F03')) {
      return this.excelVehicleService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F33')) {
      return this.excelEscaleraService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P04.F35')) {
      return this.excelGruaRemotoService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P04.F23')) {
      return this.excelGruaCabinaService.generateExcel(inspection);
    } else if (templateCode.includes('2.03.P10.F05')) {
      return this.excelTaladroService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F42')) {
      return this.excelEquipoSoldarService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F40')) {
      return this.excelEsmerilService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F39')) {
      return this.excelAmoladoraService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F20')) {
      return this.excelCilindrosService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F30')) {
      return this.excelAndamiosService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F25')) {
      return this.excelFrecuenteTecleService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F24')) {
      return this.excelPreUsoTecleService.generateExcel(inspection);
    } else if (templateCode.includes('3.04.P37.F19')) {
      return this.excelElementosIzajeService.generateExcel(inspection);
    } else if (templateCode.includes('1.02.P06.F19')) {
      return this.excelArnestService.generateExcel(inspection);
    }
    return null;
  }

  /** Genera el documento final (Excel o PDF) para una inspección ya cargada. */
  private async generarDocumento(
    inspection: any,
    formato: 'excel' | 'pdf',
  ): Promise<Buffer | null> {
    const excelBuffer = await this.generarExcelBuffer(
      inspection,
      inspection.templateCode,
    );
    if (!excelBuffer) return null;
    if (formato === 'excel') return excelBuffer;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la inspección para el nombre de archivo. */
  private resolverDatosArchivo(inspection: any): {
    nombre: string;
    area: string;
    inspector: string;
    fecha: Date | string | undefined;
  } {
    const verification = inspection.verification || {};
    const area =
      inspection.area ||
      verification['AREA'] ||
      verification['ÁREA'] ||
      verification['Area'] ||
      verification['Área'] ||
      '';
    // El campo real que guardan los form-configs es "inspectorName" (ver
    // src/components/features/herra-equipos/config/form-configs/*.ts en el
    // frontend); "name" nunca se usa salvo en un fallback que ningún
    // template real invoca.
    const inspectorSignature = inspection.inspectorSignature || {};
    const inspector =
      inspectorSignature.inspectorName || inspectorSignature.name || '';

    return {
      nombre: inspection.templateName || inspection.templateCode,
      area: String(area || ''),
      inspector: String(inspector || ''),
      fecha: inspection.submittedAt,
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
      console.error('❌ Error generando ZIP (herra-equipos):', err);
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
        const inspection = await this.inspectionsService.findOne(id);
        if (!inspection) continue;

        const buffer = await this.generarDocumento(inspection, format);
        if (!buffer) continue;

        const { nombre, area, inspector, fecha } =
          this.resolverDatosArchivo(inspection);
        const filename = buildInspectionFilename(
          nombre,
          area,
          inspector,
          fecha,
          extension,
        );
        archive.append(buffer, { name: dedupeFilename(filename, usados) });
      } catch (err) {
        console.error(`Error procesando inspección ${id} para el ZIP:`, err);
      }
    }

    await archive.finalize();
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    try {
      console.log(`📊 Generando Excel para inspección ID: ${id}`);

      const inspection = await this.inspectionsService.findOne(id);

      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspección no encontrada',
        });
      }

      const templateCode = inspection.templateCode;
      const buffer = await this.generarDocumento(inspection, 'excel');

      if (!buffer) {
        return res.status(400).json({
          success: false,
          message: `No se pudo generar el archivo Excel para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.resolverDatosArchivo(inspection);
      const filename = buildInspectionFilename(
        nombre,
        area,
        inspector,
        fecha,
        'xlsx',
      );

      console.log(`✅ Excel generado exitosamente: ${filename}`);

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDispositionHeader(filename),
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

      const inspection = await this.inspectionsService.findOne(id);

      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspección no encontrada',
        });
      }

      const templateCode = inspection.templateCode;
      const pdfBuffer = await this.generarDocumento(inspection, 'pdf');

      if (!pdfBuffer) {
        return res.status(400).json({
          success: false,
          message: `No se pudo generar el archivo PDF para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.resolverDatosArchivo(inspection);
      const filename = buildInspectionFilename(
        nombre,
        area,
        inspector,
        fecha,
        'pdf',
      );

      console.log(`✅ PDF generado exitosamente: ${filename}`);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDispositionHeader(filename),
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
