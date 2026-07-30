import { Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
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

export interface DocumentFilenameParts {
  nombre: string;
  area: string;
  inspector: string;
  fecha: Date | string | undefined;
}

/**
 * Encapsula la generación de documentos (Excel/PDF) de una instancia de
 * formulario: dispatch de templateCode (+ revisión) → generador
 * especializado, y resolución de los campos usados para el nombre de
 * archivo. Extraído del controlador para que este último se limite a
 * orquestar request → servicio → respuesta.
 */
@Injectable()
export class InstancesDocumentService {
  constructor(
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

  /**
   * Resuelve el buffer de Excel correspondiente al templateCode de la
   * instancia, probando cada generador especializado.
   */
  async generarExcelBuffer(
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

  /** Extrae templateCode/templateRevision de la instancia (con template populado). */
  private resolverTemplateInfo(inspeccion: any): {
    templateCode: string;
    templateRevision: string;
  } {
    const template = inspeccion.templateId;
    return {
      templateCode: template?.code?.toUpperCase() || '',
      templateRevision: template?.revision || '',
    };
  }

  /** Genera el Excel para una instancia ya cargada (para el PDF, ver `generarPdfStream`). */
  async generarDocumento(inspeccion: any): Promise<Buffer | null> {
    const { templateCode, templateRevision } =
      this.resolverTemplateInfo(inspeccion);
    return this.generarExcelBuffer(inspeccion, templateCode, templateRevision);
  }

  /** Genera el PDF de una instancia como stream (evita bufferizarlo entero en memoria). */
  async generarPdfStream(inspeccion: any): Promise<Readable | null> {
    const { templateCode, templateRevision } =
      this.resolverTemplateInfo(inspeccion);
    const excelBuffer = await this.generarExcelBuffer(
      inspeccion,
      templateCode,
      templateRevision,
    );
    if (!excelBuffer) return null;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la instancia para el nombre de archivo. */
  resolverDatosArchivo(inspeccion: any): DocumentFilenameParts {
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
}
