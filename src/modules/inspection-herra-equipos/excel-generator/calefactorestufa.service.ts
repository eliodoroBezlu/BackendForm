import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';
import { insertarImagenEnCelda } from './comun/imagen-excel.util';

/**
 * Excel de la 1.02.P06.F72 — Inspección de calefactores verticales, techo y
 * estufas (Rev. 0). El PDF sale de este mismo Excel (ExcelToPdfService).
 *
 * Las respuestas llegan por posición de la plantilla:
 * `responses.section_N.sub0.q0` es el código del equipo y
 * `responses.section_N.sub1.qK` las preguntas. Las secciones que el
 * inspector no eligió (selector ROOT) quedan en blanco.
 */
interface Bloque {
  seccion: string;
  celdaCodigo: string;
  primeraFila: number;
  ultimaFila: number;
}

const BLOQUES: Bloque[] = [
  { seccion: 'section_0', celdaCodigo: 'C9', primeraFila: 9, ultimaFila: 19 }, // A. Calefactores verticales
  { seccion: 'section_1', celdaCodigo: 'C22', primeraFila: 22, ultimaFila: 27 }, // B. Radiación para techo
  { seccion: 'section_2', celdaCodigo: 'C30', primeraFila: 30, ultimaFila: 35 }, // C. Estufas
];

const COLUMNAS = { si: 'H', no: 'I', na: 'J', observaciones: 'K' };

type Respuesta = { value?: unknown; observacion?: string };

@Injectable()
export class ExcelCalefactorEstufaService {
  private readonly logger = new Logger(ExcelCalefactorEstufaService.name);
  private readonly templatePath = path.join(process.cwd(), 'src', 'templates', 'CalefactoresEstufas.xlsx');

  canHandle(templateCode: string): boolean {
    return templateCode.toUpperCase().includes('1.02.P06.F72');
  }

  async generateExcel(inspection: InspectionHerraEquipos): Promise<Buffer> {
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`El archivo template no existe en: ${this.templatePath}`);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);
    const hoja = workbook.worksheets[0];

    this.llenarVerificacion(hoja, inspection);
    this.llenarRespuestas(hoja, inspection);
    if (inspection.generalObservations?.trim()) {
      hoja.getCell('B39').value = inspection.generalObservations;
    }
    await this.llenarFirmas(hoja, inspection);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Encabezado: el valor va a la derecha de cada etiqueta del formato. */
  private llenarVerificacion(hoja: ExcelJS.Worksheet, inspection: InspectionHerraEquipos) {
    const v = (inspection.verification ?? {}) as Record<string, unknown>;
    const texto = (clave: string) => (v[clave] === undefined || v[clave] === null ? '' : String(v[clave]));
    hoja.getCell('C4').value = texto('EMPRESA');
    hoja.getCell('H4').value = texto('SUPERINTENDENCIA');
    hoja.getCell('C5').value = texto('FECHA DE INSPECCIÓN');
    hoja.getCell('H5').value = texto('ÁREA FÍSICA DE UBICACIÓN DE LA CALENTADOR O ESTUFA');
  }

  private llenarRespuestas(hoja: ExcelJS.Worksheet, inspection: InspectionHerraEquipos) {
    const respuestas = (inspection.responses ?? {}) as Record<string, Record<string, Record<string, Respuesta>>>;
    for (const bloque of BLOQUES) {
      const seccion = respuestas[bloque.seccion];
      const codigo = seccion?.sub0?.q0?.value;
      const preguntas = seccion?.sub1;
      if (!preguntas || Object.keys(preguntas).length === 0) continue; // no seleccionada

      hoja.getCell(bloque.celdaCodigo).value = codigo ? String(codigo) : '';
      Object.keys(preguntas)
        .filter((k) => /^q\d+$/.test(k))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        .forEach((clave, indice) => {
          const fila = bloque.primeraFila + indice;
          if (fila > bloque.ultimaFila) return;
          const r = preguntas[clave];
          const valor = String(r?.value ?? '').toLowerCase().trim();
          const columna =
            valor === 'si' || valor === 'bueno' ? COLUMNAS.si : valor === 'no' || valor === 'malo' ? COLUMNAS.no : valor === 'na' || valor === 'n/a' ? COLUMNAS.na : null;
          if (columna) hoja.getCell(`${columna}${fila}`).value = 'X';
          if (r?.observacion?.trim()) hoja.getCell(`${COLUMNAS.observaciones}${fila}`).value = r.observacion;
        });
    }
  }

  private async llenarFirmas(hoja: ExcelJS.Worksheet, inspection: InspectionHerraEquipos) {
    const firma = async (imagen: unknown, celda: string) => {
      if (typeof imagen === 'string' && imagen.startsWith('data:image/')) {
        try {
          await insertarImagenEnCelda(hoja, imagen, celda, { altoDeFila: 25 });
        } catch (error) {
          this.logger.error(`No se pudo insertar la firma en ${celda}: ${(error as Error).message}`);
        }
      }
    };
    const insp = inspection.inspectorSignature;
    if (insp?.inspectorName) hoja.getCell('N38').value = insp.inspectorName;
    await firma(insp?.inspectorSignature, 'N40');
    const sup = inspection.supervisorSignature;
    if (sup?.supervisorName) hoja.getCell('N42').value = sup.supervisorName;
    await firma(sup?.supervisorSignature, 'N44');
  }
}
