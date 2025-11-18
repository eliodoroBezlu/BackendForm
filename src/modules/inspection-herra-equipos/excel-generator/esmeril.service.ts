import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';

@Injectable()
export class ExcelEsmerilService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelEsmerilService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'Esmeril.xlsx');
  }

  /**
   * Códigos de template soportados: 1.02.P06.F40
   */
  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F40'];
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
      return codeMatch && revision === '2';
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
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer: ExcelJS.Buffer = Buffer.from(
        base64Data,
        'base64',
      ) as unknown as ExcelJS.Buffer;

      const imageId = worksheet.workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
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

  /**
   * Convierte una referencia de celda (ej: "B5") a coordenadas numéricas
   */
  private getCellCoordinates(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, '');
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ''), 10);

    let col = 0;
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }

    return { row, col };
  }

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

      worksheet.getCell('C5').value = valores[0] || ''; // Direccion gerencia
      worksheet.getCell('H5').value = valores[1] || ''; // superintendencia
      worksheet.getCell('C6').value = valores[2] || ''; // empresa
      worksheet.getCell('H6').value = valores[3] || ''; // fecha
      worksheet.getCell('C7').value = valores[4] || ''; // ubicacion 
      worksheet.getCell('H7').value = valores[5] || ''; // identificacion
      worksheet.getCell('C8').value = valores[6] || ''; // marca
       worksheet.getCell('H8').value = valores[7] || ''; // DIÁMETRO DE DISCOS

      this.logger.log('Campos de verificación completados exitosamente');
    } catch (error) {
      this.logger.error(
        `Error al llenar campos de verificación: ${error.message}`,
      );
      throw error;
    }
  }

  private async marcarCasilla(
    worksheet: ExcelJS.Worksheet,
    cellRef: string,
    marcado: boolean,
    concatenar: boolean = false, // ← Nuevo parámetro
  ) {
    const CASILLA_MARCADA = '☑';
    const CASILLA_VACIA = '☐';

    const cell = worksheet.getCell(cellRef);
    const marca = marcado ? CASILLA_MARCADA : CASILLA_VACIA;

    if (concatenar && cell.value) {
      // Concatenar con el texto existente
      cell.value = `${cell.value} ${marca}`;
    } else {
      // Reemplazar completamente
      cell.value = marca;
    }

    // Aplicar formato centrado
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
  }

  /**
   * Llena los datos específicos del vehículo (tipo inspección, certificación, etc.)
   */
  private async llenarDatosEsmeril(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      if (!inspection.verification) {
        this.logger.warn('No se encontraron datos de verificación');
        return;
      }

      this.logger.log('Iniciando llenado de datos específicos del taladro');

      // Obtener el código de color (buscar con diferentes posibles nombres)
      const codigoColor =
        inspection.verification['codigoColor'] ||
        inspection.verification['CÓDIGO COLOR'] ||
        inspection.verification['codigo_color'] ||
        inspection.verification['CodigoColor'];

      if (codigoColor) {
        this.logger.log(`Código de color detectado: "${codigoColor}"`);

        // Mapeo de colores a celdas (ajusta según tu Excel)
        const colorMapping: Record<string, string> = {
          amarillo: 'L7',
          verde: 'K8',
          azul: 'K7',
          blanco: 'L8',
        };

        const colorNormalizado = String(codigoColor).toLowerCase().trim();

        // Marcar todas las casillas usando el método existente
        for (const [color, cellRef] of Object.entries(colorMapping)) {
          const estaMarcada = color === colorNormalizado;
          await this.marcarCasilla(worksheet, cellRef, estaMarcada, true); // true = concatenar
          this.logger.log(
            `${estaMarcada ? '✅' : '☐'} ${color.toUpperCase()} en ${cellRef}`,
          );
        }
      } else {
        this.logger.warn('⚠️ No se encontró código de color en verification');
      }

      this.logger.log('✅ Datos específicos del taladro completados');
    } catch (error) {
      this.logger.error(
        `❌ Error al llenar datos del taladro: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Llena las respuestas de las preguntas de inspección
   */
  private async llenarRespuestas(
  worksheet: ExcelJS.Worksheet,
  inspection: InspectionHerraEquipos,
) {
  try {
    this.logger.log('Iniciando llenado de respuestas');

    if (!inspection.responses || Object.keys(inspection.responses).length === 0) {
      this.logger.warn('No se encontraron respuestas en la inspección');
      return;
    }

    // Configuración de todas las secciones posibles
    const allSections = [
      { 
        id: 'section_0', 
        startRow: 14, 
        endRow: 27, 
        name: 'CONDICIÓN ES ESTÁNDAR',
        skipRows: [19] // ← Filas a saltar
      },
    ];

    // Columnas fijas
    const siCol = 'I';
    const noCol = 'J';
    const observacionesCol = 'K';

    // Procesar cada sección que exista en las respuestas
    Object.entries(inspection.responses).forEach(
      ([sectionId, sectionResponses], index) => {
        let sectionConfig = allSections.find((s) => s.id === sectionId);

        if (!sectionConfig && index < allSections.length) {
          sectionConfig = allSections[index];
          this.logger.log(`Sección ${sectionId} mapeada por índice a: ${sectionConfig.name}`);
        }

        if (!sectionConfig) {
          this.logger.warn(`No se puede mapear la sección: ${sectionId}`);
          return;
        }

        this.logger.log(`Procesando: ${sectionConfig.name} (desde ${sectionId})`);

        let currentRow = sectionConfig.startRow;
        const skipRows = sectionConfig.skipRows || [];

        // Procesar preguntas
        Object.entries(sectionResponses as Record<string, any>).forEach(
          ([questionId, response]) => {
            if (currentRow > sectionConfig.endRow) {
              this.logger.warn(`Límite excedido en ${sectionConfig.name}`);
              return;
            }

            // ← SALTAR FILAS ESPECIFICADAS
            while (skipRows.includes(currentRow)) {
              this.logger.log(`⏭️ Saltando fila ${currentRow}`);
              currentRow++;
              
              // Verificar si nos pasamos del límite después de saltar
              if (currentRow > sectionConfig.endRow) {
                this.logger.warn(`Límite excedido después de saltar filas`);
                return;
              }
            }

            try {
              this.logger.log(`📝 Llenando fila ${currentRow}`);
              
              // Limpiar celdas
              worksheet.getCell(`${siCol}${currentRow}`).value = '';
              worksheet.getCell(`${noCol}${currentRow}`).value = '';

              // Procesar respuesta
              if (response.value !== undefined && response.value !== null) {
                const valor = String(response.value).toLowerCase().trim();

                if (valor === 'bueno' || valor === 'si' || valor === 'true' || valor === '1') {
                  worksheet.getCell(`${siCol}${currentRow}`).value = 'X';
                } else if (valor === 'malo' || valor === 'no' || valor === 'false' || valor === '0') {
                  worksheet.getCell(`${noCol}${currentRow}`).value = 'X';
                }
              }

              // Observaciones
              if (response.observacion?.trim()) {
                worksheet.getCell(`${observacionesCol}${currentRow}`).value = response.observacion;
              }

              currentRow++;
            } catch (error) {
              this.logger.error(`Error en fila ${currentRow}: ${error.message}`);
              currentRow++;
            }
          },
        );
      },
    );

    this.logger.log('Respuestas completadas exitosamente');
  } catch (error) {
    this.logger.error(`Error al llenar respuestas: ${error.message}`);
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
  private async llenarFirmas(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('Iniciando llenado de firmas');

      // Configuración de posiciones exactas
      const posiciones = {
        inspector: {
          nombre: 'C9',
          firma: 'H9',
          fecha: 'B47',
          cargo: 'A70',
        },
        supervisor: {
          nombre: 'H45',
          firma: 'H46',
          fecha: 'H47',
          cargo: 'I70',
        },
      };

      // INSPECTOR
      if (inspection.inspectorSignature) {
        const insp = inspection.inspectorSignature;

        if (insp.inspectorName)
          worksheet.getCell(posiciones.inspector.nombre).value =
            insp.inspectorName;

        if (
          insp.inspectorSignature &&
          typeof insp.inspectorSignature === 'string' &&
          insp.inspectorSignature.startsWith('data:image/')
        ) {
          await this.insertarImagen(
            worksheet,
            insp.inspectorSignature,
            posiciones.inspector.firma,
          );
        }

        // if (insp.inspectionDate)
        //   worksheet.getCell(posiciones.inspector.fecha).value =
        //     insp.inspectionDate;
        // if (insp.cargo) worksheet.getCell(posiciones.inspector.cargo).value = insp.cargo;
      }

      // SUPERVISOR
      if (inspection.supervisorSignature) {
        const sup = inspection.supervisorSignature;

        // if (sup.supervisorName)
        //   worksheet.getCell(posiciones.supervisor.nombre).value =
        //     sup.supervisorName;

        // if (
        //   sup.supervisorSignature &&
        //   typeof sup.supervisorSignature === 'string' &&
        //   sup.supervisorSignature.startsWith('data:image/')
        // ) {
        //   await this.insertarImagen(
        //     worksheet,
        //     sup.supervisorSignature,
        //     posiciones.supervisor.firma,
        //   );
        // }

        // if (sup.supervisorDate)
        //   worksheet.getCell(posiciones.supervisor.fecha).value =
        //     sup.supervisorDate;
        //  if (sup.cargo) worksheet.getCell(posiciones.supervisor.cargo).value = sup.cargo;
      }

      // Ajustar altura de filas para las imágenes de firma
      //  worksheet.getRow(69).height = 40;

      this.logger.log('Firmas completadas exitosamente');
    } catch (error) {
      this.logger.error(`Error al llenar firmas: ${error.message}`);
      throw error;
    }
  }

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
      await this.llenarFirmas(worksheet, inspection);
      await this.llenarDatosEsmeril(worksheet, inspection);

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
