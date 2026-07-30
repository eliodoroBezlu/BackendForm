import { Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import { InspeccionesEmergenciaExcelService } from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.service';
import { ExcelToPdfService } from '../inspection-herra-equipos/pdf/excel-to-pdf.service';

export interface DocumentFilenameParts {
  nombre: string;
  area: string;
  inspector: string;
  fecha: Date | string | undefined;
}

/**
 * Encapsula la generación de documentos (Excel/PDF) de una inspección de
 * sistemas de emergencia y la resolución de los campos usados para el
 * nombre de archivo. Extraído del controlador para que este último se
 * limite a orquestar request → servicio → respuesta.
 */
@Injectable()
export class InspeccionesEmergenciaDocumentService {
  constructor(
    private readonly formularioInspeccionEmergencia: InspeccionesEmergenciaExcelService,
    private readonly excelToPdfService: ExcelToPdfService,
  ) {}

  /** Genera el Excel para una inspección ya cargada (para el PDF, ver `generarPdfStream`). */
  async generarDocumento(inspeccion: any): Promise<Buffer | null> {
    return this.formularioInspeccionEmergencia.generateExcelSingle(inspeccion);
  }

  /** Genera el PDF de una inspección como stream (evita bufferizarlo entero en memoria). */
  async generarPdfStream(inspeccion: any): Promise<Readable | null> {
    const excelBuffer = await this.generarDocumento(inspeccion);
    if (!excelBuffer) return null;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la inspección para el nombre de archivo. */
  resolverDatosArchivo(inspeccion: any): DocumentFilenameParts {
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
}
