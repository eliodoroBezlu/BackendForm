import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';
import { resizeImageBuffer } from '../../../common/utils/image-resize.util';

@Injectable()
export class ExcelFrecuenteTecleService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelFrecuenteTecleService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'FrecuenteTecle.xlsx');
  }

  /**
   * Códigos de template soportados: 3.04.P37.F25
   */
  getSupportedTemplateCodes(): string[] {
    return ['3.04.P37.F25'];
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

      worksheet.getCell('D5').value = valores[0] || ''; // inspector
      worksheet.getCell('D6').value = valores[1] || ''; // supervisor
      worksheet.getCell('D7').value = valores[2] || ''; // gerencia
      worksheet.getCell('N5').value = valores[3] || ''; // fecha
      worksheet.getCell('N7').value = valores[4] || ''; // area
      worksheet.getCell('B9').value = valores[5] || ''; // tag
      worksheet.getCell('F9').value = valores[6] || ''; // tipo
      worksheet.getCell('K9').value = valores[7] || ''; // capacidad nominal

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
  private async llenarDatosTecle(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      if (!inspection.outOfService) {
        this.logger.warn('No se encontraron datos de verificación');
        return;
      }

      this.logger.log('Iniciando llenado de datos específicos del taladro');

      // Definir todas las celdas posibles
      const celdas = {
        apto: 'F38',
        mantenimiento: 'H38',
        rechazado: 'M38',
      };

      if (inspection.outOfService?.status) {
        const status = inspection.outOfService.status.toLowerCase();
        this.logger.log(`Procesando outOfService status: "${status}"`);

        // Determinar qué celda marcar
        let celdaSeleccionada: string | null = null;

        if (status.includes('apto') || status === 'ap' || status === 'si') {
          celdaSeleccionada = celdas.apto;
        } else if (status.includes('mantenimiento') || status === 'man') {
          celdaSeleccionada = celdas.mantenimiento;
        } else if (
          status.includes('rechazado') ||
          status === 'rech' ||
          status === 'no'
        ) {
          celdaSeleccionada = celdas.rechazado;
        } else {
          this.logger.warn(`Estado no reconocido: "${status}"`);
          return;
        }

        // Marcar TODAS las casillas: la seleccionada con ☑ y las demás con ☐
        for (const [tipo, celda] of Object.entries(celdas)) {
          const estaSeleccionada = celda === celdaSeleccionada;
          await this.marcarCasilla(worksheet, celda, estaSeleccionada, true);

          this.logger.log(`${estaSeleccionada ? '☑' : '☐'} ${tipo}: ${celda}`);
        }

        this.logger.log(`✅ Estado "${status}" procesado correctamente`);
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

      if (
        !inspection.responses ||
        Object.keys(inspection.responses).length === 0
      ) {
        this.logger.warn('No se encontraron respuestas en la inspección');
        return;
      }

      // Configuración de todas las secciones posibles
      const allSections = [
        {
          id: 'section_0',
          startRow: 12,
          endRow: 25,
          name: 'CONDICIÓN ES ESTÁNDAR',
          skipRows: [36], // ← Filas a saltar
        },
      ];

      // Columnas fijas
      const opCol = 'F';
      const manCol = 'G';
      const descripcionCol = 'H';
      const observacionesCol = 'Q';

      // Procesar cada sección que exista en las respuestas
      Object.entries(inspection.responses).forEach(
        ([sectionId, sectionResponses], index) => {
          let sectionConfig = allSections.find((s) => s.id === sectionId);

          if (!sectionConfig && index < allSections.length) {
            sectionConfig = allSections[index];
            this.logger.log(
              `Sección ${sectionId} mapeada por índice a: ${sectionConfig.name}`,
            );
          }

          if (!sectionConfig) {
            this.logger.warn(`No se puede mapear la sección: ${sectionId}`);
            return;
          }

          this.logger.log(
            `Procesando: ${sectionConfig.name} (desde ${sectionId})`,
          );

          let currentRow = sectionConfig.startRow;
          const skipRows = sectionConfig.skipRows || [];

          // Procesar preguntas
          Object.entries(sectionResponses).forEach(([questionId, response]) => {
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
              worksheet.getCell(`${opCol}${currentRow}`).value = '';
              worksheet.getCell(`${manCol}${currentRow}`).value = '';

              // Procesar respuesta
              if (response.value !== undefined && response.value !== null) {
                const valor = String(response.value).toLowerCase().trim();

                if (
                  valor === 'bueno' ||
                  valor === 'si' ||
                  valor === 'true' ||
                  valor === '1' ||
                  valor === 'operativo'
                ) {
                  worksheet.getCell(`${opCol}${currentRow}`).value = 'X';
                } else if (
                  valor === 'malo' ||
                  valor === 'no' ||
                  valor === 'false' ||
                  valor === '0' ||
                  valor === 'mantenimiento'
                ) {
                  worksheet.getCell(`${manCol}${currentRow}`).value = 'X';
                }
              }

              // Observaciones
              if (response.observacion?.trim()) {
                worksheet.getCell(`${observacionesCol}${currentRow}`).value =
                  response.observacion;
              }

              if (response.description?.trim()) {
                worksheet.getCell(`${descripcionCol}${currentRow}`).value =
                  response.description;
              }

              currentRow++;
            } catch (error) {
              this.logger.error(
                `Error en fila ${currentRow}: ${error.message}`,
              );
              currentRow++;
            }
          });
        },
      );

      this.logger.log('Respuestas completadas exitosamente');
    } catch (error) {
      this.logger.error(`Error al llenar respuestas: ${error.message}`);
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

        // 1. RECUPERAR valor actual de la celda de forma segura
        let valorActual = '';

        if (cell.value) {
          // Si es un objeto de texto enriquecido (RichText)
          if (typeof cell.value === 'object' && 'richText' in cell.value) {
            valorActual = cell.value.richText.map((part) => part.text).join('');
          }
          // Si es una fórmula
          else if (typeof cell.value === 'object' && 'result' in cell.value) {
            valorActual = String(
              (cell.value as ExcelJS.CellFormulaValue).result || '',
            );
          }
          // Si es un valor simple
          else {
            valorActual = String(cell.value);
          }
        }

        // 2. CONCATENAR con las nuevas observaciones
        const valorConcatenado = valorActual.trim()
          ? `${valorActual}\n${inspection.generalObservations}`
          : inspection.generalObservations;

        // 3. ASIGNAR el nuevo valor concatenado
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
          workbook.getWorksheet('Formato') ||
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
      await this.llenarDatosTecle(worksheet, inspection);
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
