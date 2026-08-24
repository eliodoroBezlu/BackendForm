import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';
import { entradasDe } from '../../../common/tipos/registro.util';
import { insertarImagenEnCelda } from './comun/imagen-excel.util';

interface GroupedQuestionData {
  values: {
    eslinga_sintetica?: string;
    eslinga_cable?: string;
    grillete?: string;
    gancho?: string;
  };
  observacion?: string;
}

@Injectable()
export class ExcelElementosIzajeService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelElementosIzajeService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'ElementosIzaje.xlsx');
  }

  /**
   * Códigos de template soportados: 3.04.P37.F19
   */
  getSupportedTemplateCodes(): string[] {
    return ['3.04.P37.F19'];
  }

  /**
   * Verifica si este servicio puede manejar el código y revisión del template
   */
  canHandle(templateCode: string, revision?: string): boolean {
    const codeMatch = this.getSupportedTemplateCodes().some((code) =>
      templateCode.toUpperCase().includes(code.toUpperCase()),
    );

    // Si se especifica revisión, validarla también
    if (revision) {
      return codeMatch && revision === '4';
    }

    return codeMatch;
  }

  /**
   * Inserta una imagen base64 en una celda específica del worksheet
   */
  private async insertarImagen(
    worksheet: ExcelJS.Worksheet,
    base64Image: string,
    cellRef: string,
  ) {
    try {
      await insertarImagenEnCelda(worksheet, base64Image, cellRef, {
        altoDeFila: 25,
      });
    } catch (error) {
      this.logger.error(`Error al insertar imagen: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convierte una referencia de celda (ej: "B5") a coordenadas numéricas
   */

  /**
   * Llena los campos de verificación del vehículo
   * IMPORTANTE: Ajustar las posiciones de celdas según el template real
   */
  private async llenarCamposVerificacion(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log(
        'Iniciando llenado de campos de verificación del vehículo',
      );

      if (!inspection.verification) {
        this.logger.warn('No se encontraron datos de verificación');
        return;
      }

      const valores = Array.from(Object.values(inspection.verification));

      worksheet.getCell('D5').value = valores[0] || ''; // USARIO
      worksheet.getCell('D7').value = valores[1] || ''; // empresa
      worksheet.getCell('D9').value = valores[2] || ''; // nombre del andamista responsable
      worksheet.getCell('N5').value = valores[3] || ''; // fecha de inspeccion
      worksheet.getCell('N7').value = valores[4] || ''; // proyecto orden de trabajo
      worksheet.getCell('N9').value = valores[5] || ''; // area fisica del montaje

      this.logger.log('Campos de verificación completados exitosamente');
    } catch (error) {
      this.logger.error(
        `Error al llenar campos de verificación: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Llena los datos específicos del vehículo (tipo inspección, certificación, etc.)
   */
  private async llenarAccesoriosConfig(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('📊 Iniciando llenado de configuración de accesorios');

      if (!inspection.accesoriosConfig) {
        this.logger.warn('⚠️ No se encontró accesoriosConfig');
        return;
      }

      const config = inspection.accesoriosConfig;

      // Mapeo de accesorios a filas del Excel
      const accesorioMapping = {
        eslinga_sintetica: { cantidadCell: 'F13', tipoCell: 'F39' },
        grillete: { cantidadCell: 'H13', tipoCell: 'H39' },
        eslinga_cable: { cantidadCell: 'J13', tipoCell: 'J39' },
        gancho: { cantidadCell: 'L13', tipoCell: 'L39' },
      };

      // Llenar cada accesorio
      Object.entries(accesorioMapping).forEach(([key, cells]) => {
        const accesorio = config[key];

        if (accesorio) {
          // Cantidad
          if (accesorio.cantidad) {
            worksheet.getCell(cells.cantidadCell).value = accesorio.cantidad;
            worksheet.getCell(cells.cantidadCell).alignment = {
              vertical: 'middle',
              horizontal: 'center',
            };
            this.logger.log(
              `  ✅ ${key}: cantidad=${accesorio.cantidad} en ${cells.cantidadCell}`,
            );
          }

          // Tipo de Servicio
          if (accesorio.tipoServicio) {
            worksheet.getCell(cells.tipoCell).value = accesorio.tipoServicio;
            worksheet.getCell(cells.tipoCell).alignment = {
              vertical: 'middle',
              horizontal: 'center',
            };
            this.logger.log(
              `  ✅ ${key}: tipoServicio=${accesorio.tipoServicio} en ${cells.tipoCell}`,
            );
          }
        }
      });

      this.logger.log('✅ Configuración de accesorios completada');
    } catch (error) {
      this.logger.error(
        `❌ Error al llenar accesorios config: ${error.message}`,
      );
      throw error;
    }
  }
  /**
   * Llena las respuestas de las preguntas de inspección
   */
  /**
   * Llena las respuestas agrupadas por columnas
   */
  private async llenarRespuestas(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('📋 Iniciando llenado de respuestas agrupadas');

      // ✅ CORRECCIÓN: Acceder a inspection.responses.responses
      const responsesData = inspection.responses as any;

      this.logger.log(
        '🔍 Estructura de responses:',
        JSON.stringify(responsesData, null, 2),
      );

      // Verificar que existe la estructura correcta
      if (!responsesData || typeof responsesData !== 'object') {
        this.logger.warn('⚠️ responses no es un objeto válido');
        return;
      }

      // ✅ Acceder a responses.responses (anidado)
      let responsesArray: any[];

      if (Array.isArray(responsesData)) {
        // Si ya es un array directamente
        responsesArray = responsesData;
        this.logger.log('✅ responses es un array directo');
      } else if (
        responsesData.responses &&
        Array.isArray(responsesData.responses)
      ) {
        // Si está anidado en responses.responses
        responsesArray = responsesData.responses;
        this.logger.log('✅ responses está anidado en responses.responses');
      } else {
        this.logger.warn('⚠️ No se encontró un array válido en responses');
        return;
      }

      if (responsesArray.length === 0) {
        this.logger.warn('⚠️ El array de responses está vacío');
        return;
      }

      // Obtener la primera sección
      const seccion = responsesArray[0];

      if (!seccion?.questions) {
        this.logger.warn('⚠️ No se encontraron preguntas en la sección');
        this.logger.log(
          '📦 Contenido de sección:',
          JSON.stringify(seccion, null, 2),
        );
        return;
      }

      const questions = seccion.questions;
      this.logger.log(
        `✅ Encontradas ${Object.keys(questions).length} preguntas`,
      );

      // Configuración de columnas en el Excel (según tu imagen)
      const columnas = {
        eslinga_sintetica: 'F',
        grillete: 'H',
        eslinga_cable: 'J',
        gancho: 'L',
      };

      const colObservaciones = 'N'; // Columna de comentarios (*)

      // Fila inicial de las respuestas (ajusta según tu template)
      const filaInicial = 14;

      // Procesar cada pregunta
      Object.entries(questions).forEach(([questionId, questionData]) => {
        const data = questionData as GroupedQuestionData;
        const questionNumber = parseInt(questionId.replace('q', ''), 10);
        const currentRow = filaInicial + questionNumber;

        this.logger.log(`  📝 Procesando ${questionId} en fila ${currentRow}`);

        // Procesar cada columna (accesorio)
        entradasDe(columnas).forEach(([accesorioKey, colLetra]) => {
          const valor = data.values?.[accesorioKey];

          if (valor) {
            const valorNormalizado = valor.toLowerCase().trim();
            let contenido = '';

            // Mapear valores a contenido del Excel
            if (valorNormalizado === 'si' || valorNormalizado === 'sí') {
              contenido = '✓'; // O 'X' según prefieras
            } else if (valorNormalizado === 'no') {
              contenido = 'X';
            } else if (
              valorNormalizado === 'na' ||
              valorNormalizado === 'n/a'
            ) {
              contenido = 'N/A';
            }

            if (contenido) {
              const cellRef = `${colLetra}${currentRow}`;
              worksheet.getCell(cellRef).value = contenido;
              worksheet.getCell(cellRef).alignment = {
                vertical: 'middle',
                horizontal: 'center',
              };

              this.logger.log(
                `    ✅ ${accesorioKey}: ${contenido} en ${cellRef}`,
              );
            }
          }
        });

        // Observaciones
        if (data.observacion?.trim()) {
          const cellObservacion = `${colObservaciones}${currentRow}`;
          worksheet.getCell(cellObservacion).value = data.observacion;
          worksheet.getCell(cellObservacion).alignment = {
            vertical: 'top',
            horizontal: 'left',
            wrapText: true,
          };

          this.logger.log(
            `    💬 Observación: "${data.observacion.substring(0, 30)}..." en ${cellObservacion}`,
          );
        }
      });

      this.logger.log('✅ Respuestas completadas exitosamente');
    } catch (error) {
      this.logger.error(`❌ Error al llenar respuestas: ${error.message}`);
      this.logger.error(error.stack);
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
        // ⚠️ AJUSTAR POSICIÓN SEGÚN TU TEMPLATE
        worksheet.getCell('B43').value = inspection.generalObservations;
        this.logger.log('Observaciones generales completadas');
      }
    } catch (error) {
      this.logger.error(
        `Error al llenar observaciones generales: ${error.message}`,
      );
      throw error;
    }
  }
  /**
   * Llena el diagrama de daños del vehículo
   */

  /**
   * Llena las observaciones generales
   */

  /**
   * Llena las firmas del inspector y supervisor
   */

  /**
   * Genera el archivo Excel completo para inspección de vehículos
   */
  async generateExcel(inspection: InspectionHerraEquipos): Promise<Buffer> {
    try {
      this.logger.log(
        `Iniciando generación de Excel para inspección de vehículo - Template: 3.04.P48.F03 Rev.6`,
      );
      this.logger.log(`ID Inspección: ${inspection._id || 'N/A'}`);

      // 1. Verificar que el archivo template existe
      const fs = require('fs');
      if (!fs.existsSync(this.templatePath)) {
        throw new Error(
          `El archivo template no existe en: ${this.templatePath}`,
        );
      }

      // 2. Cargar el workbook
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath);

      // 3. Obtener la hoja de trabajo
      let worksheet: ExcelJS.Worksheet | undefined = workbook.worksheets[0];

      if (!worksheet) {
        worksheet =
          workbook.getWorksheet('Hoja1') ||
          workbook.getWorksheet('Sheet1') ||
          workbook.getWorksheet('Formulario') ||
          workbook.getWorksheet('Inspección Vehículo') ||
          workbook.getWorksheet('Vehicle Inspection');
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

      // 4. Llenar todas las secciones del Excel en orden
      await this.llenarCamposVerificacion(worksheet, inspection);
      await this.llenarRespuestas(worksheet, inspection);
      await this.llenarAccesoriosConfig(worksheet, inspection);
      await this.llenarObservacionesGenerales(worksheet, inspection);

      // 5. Generar el buffer del Excel
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
