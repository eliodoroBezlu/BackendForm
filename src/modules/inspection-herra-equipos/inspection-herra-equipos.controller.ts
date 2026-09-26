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
import { InspectionHerraEquiposDocumentService } from './inspection-herra-equipos-document.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  buildInspectionFilename,
  buildContentDispositionHeader,
} from '../../common/utils/download-filename.util';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inspections-herra-equipos')
export class InspectionsHerraEquiposController {
  private readonly logger = new Logger(InspectionsHerraEquiposController.name);

  constructor(
    private readonly inspectionsService: InspectionsHerraEquiposService,
    private readonly documentService: InspectionHerraEquiposDocumentService,
    private readonly bulkDownloadService: BulkDownloadService,
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

  /**
   * Los roles restringidos solo reciben inspecciones de las plantillas
   * asignadas a su rol (de cualquier usuario, no solo las propias).
   * El filtro se aplica en el service: es la barrera que no se puede
   * saltar desde el cliente.
   */
  @Get()
  async findAll(
    @CurrentUser('roles') roles?: string[],
    @Query('status') status?: string,
    @Query('templateCode') templateCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('submittedBy') submittedBy?: string,
    // El frontend ya mandaba `limit` —la tarjeta de actividad pide 20— pero el
    // endpoint no lo leía y devolvía todo igualmente.
    @Query('limit') limit?: string,
  ) {
    const inspections = await this.inspectionsService.findAll(
      {
        status,
        templateCode,
        startDate,
        endDate,
        submittedBy,
        limit: limit ? Number(limit) : undefined,
      },
      roles,
    );

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

  /**
   * Da de baja la inspección; no la borra de la base.
   *
   * Devuelve el documento en `data` porque el interceptor de auditoría archiva
   * lo que devuelven los `DELETE`. Si algún día esto dejara de devolverlo, la
   * bitácora volvería a guardar solo quién y cuándo.
   */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE, Role.SUPERVISOR)
  async remove(
    @Param('id') id: string,
    @CurrentUser('username') username?: string,
  ) {
    const result = await this.inspectionsService.remove(id, username);

    return {
      success: true,
      ...result,
    };
  }

  @Post(':id/restaurar')
  @Roles(Role.ADMIN)
  async restaurar(@Param('id') id: string) {
    const inspeccion = await this.inspectionsService.restaurar(id);

    return {
      success: true,
      message: 'Inspección restaurada',
      data: inspeccion,
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
        const inspection = await this.inspectionsService.findOne(id);
        if (!inspection) return null;

        const contenido =
          fmt === 'pdf'
            ? await this.documentService.generarPdfStream(inspection)
            : await this.documentService.generarDocumento(inspection);
        if (!contenido) return null;

        const { nombre, area, inspector, fecha } =
          this.documentService.resolverDatosArchivo(inspection);
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
      console.log(`📊 Generando Excel para inspección ID: ${id}`);

      const inspection = await this.inspectionsService.findOne(id);

      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspección no encontrada',
        });
      }

      const templateCode = inspection.templateCode;
      const buffer = await this.documentService.generarDocumento(inspection);

      if (!buffer) {
        return res.status(400).json({
          success: false,
          message: `No se pudo generar el archivo Excel para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.documentService.resolverDatosArchivo(inspection);
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
      const pdfStream = await this.documentService.generarPdfStream(inspection);

      if (!pdfStream) {
        return res.status(400).json({
          success: false,
          message: `No se pudo generar el archivo PDF para el template: ${templateCode}`,
        });
      }

      const { nombre, area, inspector, fecha } =
        this.documentService.resolverDatosArchivo(inspection);
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
        'Cache-Control': 'no-cache',
      });

      pdfStream.on('error', (err) => {
        console.error('❌ Error en el stream de PDF:', err);
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
