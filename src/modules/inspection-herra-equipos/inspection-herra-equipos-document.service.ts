import { Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import { ExcelVehicleService } from './excel-generator/vehicle.service';
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
import { ExcelArnestService } from './excel-generator/arnes.service';
import { ExcelInspeccionFrecuenteService } from './excel-generator/inspeccion-frecuente-equipos.service';
import { ExcelToPdfService } from './pdf/excel-to-pdf.service';

export interface DocumentFilenameParts {
  nombre: string;
  area: string;
  inspector: string;
  fecha: Date | string | undefined;
}

/**
 * Encapsula la generación de documentos (Excel/PDF) de una inspección de
 * herramientas/equipos: dispatch de templateCode → generador especializado,
 * y resolución de los campos usados para el nombre de archivo. Extraído del
 * controlador para que este último se limite a orquestar
 * request → servicio → respuesta.
 */
@Injectable()
export class InspectionHerraEquiposDocumentService {
  constructor(
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
    private readonly excelArnestService: ExcelArnestService,
    private readonly excelInspeccionFrecuenteService: ExcelInspeccionFrecuenteService,
    private readonly excelToPdfService: ExcelToPdfService,
  ) {}

  /**
   * Resuelve el buffer de Excel correspondiente al templateCode de la
   * inspección, probando cada generador especializado.
   */
  async generarExcelBuffer(
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
    } else if (this.excelInspeccionFrecuenteService.canHandle(templateCode)) {
      // Grúas AT/RT, camión grúa y montacargas telescópicos: un solo generador
      // porque las cuatro plantillas comparten formato.
      return this.excelInspeccionFrecuenteService.generateExcel(inspection);
    }
    return null;
  }

  /** Genera el Excel para una inspección ya cargada (para el PDF, ver `generarPdfStream`). */
  async generarDocumento(inspection: any): Promise<Buffer | null> {
    return this.generarExcelBuffer(inspection, inspection.templateCode);
  }

  /** Genera el PDF de una inspección como stream (evita bufferizarlo entero en memoria). */
  async generarPdfStream(inspection: any): Promise<Readable | null> {
    const excelBuffer = await this.generarExcelBuffer(
      inspection,
      inspection.templateCode,
    );
    if (!excelBuffer) return null;
    return this.excelToPdfService.convertExcelToPdf(excelBuffer, {
      quality: 'high',
    });
  }

  /** Extrae nombre/área/inspector/fecha de la inspección para el nombre de archivo. */
  resolverDatosArchivo(inspection: any): DocumentFilenameParts {
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
}
