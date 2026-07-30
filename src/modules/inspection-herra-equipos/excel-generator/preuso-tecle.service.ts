import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposDocument,
} from '../schemas/inspection-herra-equipos.schema';
import { resizeImageBuffer } from '../../../common/utils/image-resize.util';

@Injectable()
export class ExcelPreUsoTecleService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelPreUsoTecleService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(InspectionHerraEquipos.name)
    private inspectionModel: Model<InspectionHerraEquiposDocument>,
  ) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'PreUsoTecle.xlsx');
  }

  getSupportedTemplateCodes(): string[] {
    return ['3.04.P37.F24'];
  }

  canHandle(templateCode: string, revision?: string): boolean {
    const codeMatch = this.getSupportedTemplateCodes().some((code) =>
      templateCode.toUpperCase().includes(code.toUpperCase()),
    );
    if (revision) {
      return codeMatch && revision === '4';
    }
    return codeMatch;
  }

  private async insertarImagen(
    worksheet: ExcelJS.Worksheet,
    base64Image: string,
    cellRef: string,
  ) {
    try {
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const rawBuffer = Buffer.from(base64Data, 'base64');
      const imageBuffer: ExcelJS.Buffer = (await resizeImageBuffer(
        rawBuffer,
      )) as unknown as ExcelJS.Buffer;

      const imageId = worksheet.workbook.addImage({
        buffer: imageBuffer,
        extension: 'jpeg',
      });

      const { row, col } = this.getCellCoordinates(cellRef);
      worksheet.addImage(imageId, {
        tl: { col: col - 1, row: row - 1 } as ExcelJS.Anchor,
        br: { col: col, row: row } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });

      worksheet.getRow(row).height = 25;
    } catch (error) {
      this.logger.error(`Error al insertar imagen: ${error.message}`);
      throw error;
    }
  }

  private getCellCoordinates(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, '');
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ''), 10);

    let col = 0;
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }

    return { row, col };
  }

  private async llenarCamposVerificacion(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log(
        'Iniciando llenado de campos de verificación (ENCABEZADO)',
      );

      if (!inspection.verification) {
        this.logger.warn('No se encontraron datos de verificación');
        return;
      }

      // DATOS QUE NO CAMBIAN (Encabezado del Excel)
      const supervisor = inspection.verification['Supervisor'] || '';
      const vicepresidencia =
        inspection.verification['Vicepresidencia/Gerencia'] || '';
      const mes = inspection.verification['Mes'] || '';
      const area = inspection.verification['Área'] || '';

      this.logger.log(
        `📋 Encabezado: Supervisor="${supervisor}", VP="${vicepresidencia}", Mes="${mes}", Área="${area}"`,
      );

      // Llenar celdas de encabezado (ajusta según tu template)
      worksheet.getCell('D6').value = supervisor; // Supervisor
      worksheet.getCell('D8').value = vicepresidencia; // Vicepresidencia/Gerencia
      worksheet.getCell('M6').value = mes; // Mes
      worksheet.getCell('M8').value = area; // Área

      this.logger.log(
        '✅ Campos de verificación (encabezado) completados exitosamente',
      );
    } catch (error) {
      this.logger.error(
        `Error al llenar campos de verificación: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * 🔥 NUEVA FUNCIÓN: Llena las respuestas HORIZONTALMENTE
   * Busca todas las inspecciones con: TAG + Mes + TemplateCode + Revision
   */
  private async llenarRespuestasHorizontales(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('🔍 Buscando inspecciones relacionadas...');

      // 1. Extraer criterios de búsqueda
      const tag = inspection.verification?.['TAG'];
      const mes = inspection.verification?.['Mes'];
      const area = inspection.verification?.['Área'];

      if (!tag || !mes) {
        this.logger.warn('⚠️ No se encontró TAG o Mes en la inspección');
        return;
      }

      this.logger.log(
        `📌 Criterios de búsqueda: TAG="${tag}", Mes="${mes}", Área="${area}"`,
      );

      // 2. Obtener la revisión del template
      const templateData = inspection.templateId as any;
      const revision = templateData?.revision || null;

      this.logger.log(
        `📋 Template Code: ${inspection.templateCode}, Revisión: ${revision || 'N/A'}`,
      );

      // 3. Construir query de búsqueda
      const query: any = {
        'verification.TAG': tag,
        'verification.Mes': mes,
        templateCode: '3.04.P37.F24',
      };

      if (revision && templateData) {
        query['templateId'] = templateData._id;
      }

      // 4. Buscar TODAS las inspecciones que coincidan
      const inspecciones = await this.inspectionModel
        .find(query)
        .populate('templateId')
        .sort({ 'verification.Fecha': 1 })
        .limit(11)
        .exec();

      this.logger.log(`✅ Encontradas ${inspecciones.length} inspecciones`);

      // 5. MAPEO CORREGIDO: Usa q0, q1, q2, etc.
      // IMPORTANTE: Verifica en tu template cuál pregunta corresponde a cada qX
      const columnasRespuestas = {
        q0: 'G', // Palanca o cadena de accionamiento
        q1: 'H', // Poleas de fuerza (libre)
        q2: 'I', // Poleas pulas
        q3: 'J', // Selector de movimiento
        q4: 'K', // Límites de recorrido
        q5: 'L', // Estado de los ganchos
        q6: 'M', // Estado de los seguros de los ganchos
        q7: 'N', // Estado de la cadena de Carga
        q8: 'O', // Estado de los mandos neumáticos o eléctricos
        q9: 'P', // Estado del sistema neumático o eléctrico
        q10: 'Q', // Placa de datos y TAG
      };

      // 6. INSERTAR CADA INSPECCIÓN EN UNA FILA DIFERENTE
      let filaActual = 14;
      const filaLimite = 57;

      for (const insp of inspecciones) {
        if (filaActual > filaLimite) {
          this.logger.warn('⚠️ Se alcanzó el límite de filas (24)');
          break;
        }

        this.logger.log(`📝 Fila ${filaActual}: Inspección ${insp._id}`);

        // A. Número secuencial (Columna A)
        worksheet.getCell(`A${filaActual}`).value = filaActual - 13;

        // B. TAG (Columna B)
        worksheet.getCell(`B${filaActual}`).value =
          insp.verification?.['TAG'] || '';

        // C. Datos técnicos (Columnas C-F)
        worksheet.getCell(`C${filaActual}`).value =
          insp.verification?.['Tipo'] || '';
        worksheet.getCell(`D${filaActual}`).value =
          insp.verification?.['Capacidad Nominal'] || '';
        worksheet.getCell(`E${filaActual}`).value =
          insp.verification?.['Persona que Inspecciona'] || '';

        // Formatear fecha
        const fecha = insp.verification?.['Fecha'];
        if (fecha) {
          try {
            const fechaFormateada = new Date(fecha).toLocaleDateString(
              'es-ES',
              {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              },
            );
            worksheet.getCell(`F${filaActual}`).value = fechaFormateada;
          } catch {
            worksheet.getCell(`F${filaActual}`).value = fecha;
          }
        }

        // D. Llenar respuestas en columnas G-Q
        if (insp.responses && Object.keys(insp.responses).length > 0) {
          this.logger.log(`   📋 Procesando respuestas...`);

          // Iterar sobre todas las secciones
          Object.values(insp.responses).forEach((seccionRespuestas: any) => {
            Object.entries(seccionRespuestas).forEach(
              ([preguntaId, respuesta]: [string, any]) => {
                const columna = columnasRespuestas[preguntaId]; // ✅ Ahora sí encuentra q0, q1, etc.

                if (columna) {
                  const valor = String(respuesta.value || '')
                    .toLowerCase()
                    .trim();

                  let valorExcel = '';

                  if (
                    valor === 'bueno' ||
                    valor === 'si' ||
                    valor === 'true' ||
                    valor === '1' ||
                    valor === 'operativo' ||
                    valor === 'b'
                  ) {
                    valorExcel = 'B';
                  } else if (
                    valor === 'malo' ||
                    valor === 'no' ||
                    valor === 'false' ||
                    valor === '0' ||
                    valor === 'mantenimiento' ||
                    valor === 'm'
                  ) {
                    valorExcel = 'M';
                  } else if (
                    valor === 'n/a' ||
                    valor === 'na' ||
                    valor === 'no aplica'
                  ) {
                    valorExcel = 'N/A';
                  }

                  if (valorExcel) {
                    worksheet.getCell(`${columna}${filaActual}`).value =
                      valorExcel;
                    worksheet.getCell(`${columna}${filaActual}`).alignment = {
                      vertical: 'middle',
                      horizontal: 'center',
                    };
                    this.logger.log(
                      `      ✓ ${preguntaId} → ${columna}${filaActual} = ${valorExcel}`,
                    );
                  }
                } else {
                  this.logger.warn(
                    `   ⚠️ No se encontró columna para pregunta: ${preguntaId}`,
                  );
                }
              },
            );
          });
        }

        // E. Observaciones en columna R
        if (insp.generalObservations) {
          worksheet.getCell(`R${filaActual}`).value = insp.generalObservations;
        }

        filaActual++;
      }

      this.logger.log(
        `✅ ${inspecciones.length} registros insertados exitosamente`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error al llenar respuestas horizontales: ${error.message}`,
      );
      throw error;
    }
  }

  private async llenarObservacionesGenerales(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      if (
        inspection.generalObservations &&
        inspection.generalObservations.trim() !== ''
      ) {
        const cell = worksheet.getCell('A39');

        let valorActual = '';

        if (cell.value) {
          if (typeof cell.value === 'object' && 'richText' in cell.value) {
            valorActual = cell.value.richText.map((part) => part.text).join('');
          } else if (typeof cell.value === 'object' && 'result' in cell.value) {
            valorActual = String(
              (cell.value as ExcelJS.CellFormulaValue).result || '',
            );
          } else {
            valorActual = String(cell.value);
          }
        }

        const valorConcatenado = valorActual.trim()
          ? `${valorActual}\n${inspection.generalObservations}`
          : inspection.generalObservations;

        cell.value = valorConcatenado;

        this.logger.log('Observaciones generales completadas y concatenadas');
      }
    } catch (error) {
      this.logger.error(
        `Error al llenar observaciones generales: ${error.message}`,
      );
      throw error;
    }
  }

  async generateExcel(inspection: InspectionHerraEquipos): Promise<Buffer> {
    try {
      this.logger.log(
        `Iniciando generación de Excel para inspección de vehículo - Template: 3.04.P37.F24`,
      );
      this.logger.log(`ID Inspección: ${inspection._id || 'N/A'}`);

      const fs = require('fs');
      if (!fs.existsSync(this.templatePath)) {
        throw new Error(
          `El archivo template no existe en: ${this.templatePath}`,
        );
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath);

      // 🔥 CAMBIO: Seleccionar explícitamente la hoja "Formato"
      let worksheet: ExcelJS.Worksheet | undefined;

      // Primero intenta buscar la hoja "Formato"
      worksheet = workbook.getWorksheet('Formato');

      // Si no existe "Formato", intenta con otros nombres comunes
      if (!worksheet) {
        worksheet =
          workbook.getWorksheet('Formulario') ||
          workbook.getWorksheet('Sheet1') ||
          workbook.worksheets[0]; // Última opción: primera hoja
      }

      if (!worksheet) {
        const availableSheets = workbook.worksheets
          .map((sheet) => sheet.name)
          .join(', ');
        throw new Error(
          `No se pudo encontrar una hoja de trabajo válida. Hojas disponibles: ${availableSheets}`,
        );
      }

      this.logger.log(`Usando hoja de trabajo: "${worksheet.name}"`);

      // 🔥 Validar que estamos en la hoja correcta
      if (worksheet.name !== 'Formato') {
        this.logger.warn(
          `⚠️ ADVERTENCIA: Se esperaba la hoja "Formato" pero se está usando "${worksheet.name}"`,
        );
      }

      await this.llenarCamposVerificacion(worksheet, inspection);
      await this.llenarRespuestasHorizontales(worksheet, inspection);
      await this.llenarObservacionesGenerales(worksheet, inspection);

      const excelBuffer = await workbook.xlsx.writeBuffer();
      this.logger.log('Excel de vehículo generado exitosamente');

      return Buffer.from(excelBuffer);
    } catch (error) {
      this.logger.error(`Error al generar Excel de vehículo: ${error.message}`);
      this.logger.error(error.stack);
      throw new Error(
        `Error al generar el archivo Excel de inspección de vehículo: ${error.message}`,
      );
    }
  }
}
