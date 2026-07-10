import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Res,
  Put,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { InspeccionesEmergenciaExcelService } from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.service';
import { ExtintorService } from '../extintor/extintor.service';
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
@Controller('inspecciones-emergencia')
export class InspeccionesEmergenciaController {
  constructor(
    private readonly inspeccionesEmergenciaService: InspeccionesEmergenciaService,
    private readonly formularioInspeccionEmergencia: InspeccionesEmergenciaExcelService,
    private readonly extintorService: ExtintorService,
    private readonly excelToPdfService: ExcelToPdfService,
  ) {}

  @Post('crear-formulario')
  async crearFormulario(
    @Body() createInspeccionesDto: CreateFormularioInspeccionDto,
  ) {
    return await this.inspeccionesEmergenciaService.create(
      createInspeccionesDto,
    );
  }

  @Put('actualizar-mes/:tag')
  async actualizarMes(
    @Param('tag') tag: string,
    @Body() body: { mes: string; datosMes: any; area: string },
  ) {
    const { mes, datosMes, area } = body;
    const resultado =
      await this.inspeccionesEmergenciaService.actualizarMesPorTag(
        tag,
        mes,
        datosMes,
        area,
      );
    return resultado; // Devuelve { success: true, message: "Mes actualizado correctamente" }
  }

  @Post('verificar-tag')
  async verificarTag(
    @Body() body: { tag: string; periodo: string; año: number; area: string },
  ) {
    const { tag, periodo, año, area } = body;
    return await this.inspeccionesEmergenciaService.verificarTag(
      tag,
      periodo,
      año,
      area,
    );
  }

  /** Genera el documento final (Excel o PDF) para una inspección ya cargada. */
  private async generarDocumento(
    inspeccion: any,
    formato: 'excel' | 'pdf',
  ): Promise<Buffer | null> {
    const excelBuffer =
      await this.formularioInspeccionEmergencia.generateExcelSingle(inspeccion);
    if (!excelBuffer) return null;
    if (formato === 'excel') return excelBuffer;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la inspección para el nombre de archivo. */
  private resolverDatosArchivo(inspeccion: any): {
    nombre: string;
    area: string;
    inspector: string;
    fecha: Date | string | undefined;
  } {
    const meses = inspeccion.meses;
    const mesData =
      meses instanceof Map
        ? meses.get(inspeccion.mesActual)
        : meses?.[inspeccion.mesActual];
    return {
      nombre: 'Sistemas de Emergencia',
      area: String(inspeccion.area || ''),
      inspector: String(mesData?.inspector?.nombre || ''),
      fecha: inspeccion.fechaUltimaModificacion || inspeccion.fechaCreacion,
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
      console.error('❌ Error generando ZIP (emergencia):', err);
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
        const inspeccion = await this.inspeccionesEmergenciaService.findOne(id);
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
        console.error(`Error procesando inspección ${id} para el ZIP:`, err);
      }
    }

    await archive.finalize();
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    try {
      const inspeccion = await this.inspeccionesEmergenciaService.findOne(id);
      if (!inspeccion) {
        return res.status(404).json({ message: 'Inspección no encontrada' });
      }

      const buffer = await this.generarDocumento(inspeccion, 'excel');
      if (!buffer) {
        return res
          .status(400)
          .json({ message: 'No se pudo generar el archivo Excel' });
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

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDispositionHeader(filename),
        'Content-Length': buffer.length,
      });

      res.send(buffer);
    } catch (error) {
      console.error('Error al generar Excel:', error);
      res.status(500).json({ message: 'Error al generar el archivo Excel' });
    }
  }

  @Get()
  findAll(
    @Query('area') area?: string,
    @Query('superintendencia') superintendencia?: string,
    @Query('mesActual') mesActual?: string,
    @Query('documentCode') documentCode?: string,
  ) {
    const filtros = {
      area,
      superintendencia,
      mesActual,
      documentCode,
    };

    return this.inspeccionesEmergenciaService.findAll(filtros);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto,
  ) {
    return this.inspeccionesEmergenciaService.update(
      +id,
      updateInspeccionesEmergenciaDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inspeccionesEmergenciaService.remove(+id);
  }

  // En inspecciones-emergencia.controller.ts
  @Put('actualizar-extintores/:tag')
  async actualizarExtintores(
    @Param('tag') tag: string,
    @Body() body: { extintores: any[]; area: string },
  ) {
    try {
      const { extintores, area } = body;

      if (!area) {
        throw new HttpException(
          'El área es requerida para actualizar extintores',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(`Actualizando extintores para tag: ${tag}, área: ${area}`);

      // Verificar y crear automáticamente solo los extintores que no existen
      await this.extintorService.verificarYCrearExtintores(
        extintores,
        tag,
        area,
      );

      // Actualizar el formulario con todos los extintores
      const resultadoActualizacion =
        await this.inspeccionesEmergenciaService.actualizarExtintoresPorTag(
          tag,
          extintores,
          area,
        );

      return {
        exito: true,
        actualizacion: resultadoActualizacion,
      };
    } catch (error) {
      console.error('Error al actualizar extintores:', error);
      throw new HttpException(
        error.message || 'Error al actualizar extintores',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('verificar-inspecciones')
  async verificarInspecciones(
    @Query('area') area: string,
    @Query('mesActual') mesActual: string,
  ) {
    if (!area || !mesActual) {
      throw new HttpException(
        'Los parámetros area y mesActual son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.inspeccionesEmergenciaService.verificarInspecciones(
      area,
      mesActual,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.inspeccionesEmergenciaService.findOne(id);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    try {
      console.log(`📄 Generando PDF para inspección de emergencia ID: ${id}`);

      const inspeccion = await this.inspeccionesEmergenciaService.findOne(id);
      if (!inspeccion) {
        return res.status(404).json({
          success: false,
          message: 'Inspección no encontrada',
        });
      }

      const pdfBuffer = await this.generarDocumento(inspeccion, 'pdf');
      if (!pdfBuffer) {
        return res.status(400).json({
          success: false,
          message: 'No se pudo generar el archivo PDF',
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
      console.error('❌ Error al generar PDF (emergencia):', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar el archivo PDF',
        error: error.message,
      });
    }
  }
}
