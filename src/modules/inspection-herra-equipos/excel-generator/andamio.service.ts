import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';
import { insertarImagenEnCelda } from './comun/imagen-excel.util';

@Injectable()
export class ExcelAndamiosService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelAndamiosService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'Andamios.xlsx');
  }

  /**
   * Códigos de template soportados: 1.02.P06.F30
   */
  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F30'];
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

      worksheet.getCell('C5').value = valores[0] || ''; // gerencia
      worksheet.getCell('C6').value = valores[1] || ''; // empresa
      worksheet.getCell('C7').value = valores[2] || ''; // nombre del andamista responsable
      worksheet.getCell('G5').value = valores[3] || ''; // fecha de inspeccion
      worksheet.getCell('G6').value = valores[4] || ''; // proyecto orden de trabajo
      worksheet.getCell('G7').value = valores[5] || ''; // area fisica del montaje

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
  private async llenarDatosAndamio(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('Iniciando llenado de datos del andamio');

      if (!inspection.scaffold) {
        this.logger.warn('No se encontraron datos del andamio');
        return;
      }

      const datos = inspection.scaffold;

      // ============================================
      // 1. LLENAR INSPECCIONES RUTINARIAS (máximo 6)
      // ============================================
      if (datos.routineInspections && datos.routineInspections.length > 0) {
        this.logger.log(
          `📋 Procesando ${datos.routineInspections.length} inspecciones rutinarias (máximo 6)`,
        );

        const startRow = 55;
        const maxRows = 6;
        const inspecciones = datos.routineInspections.slice(0, maxRows); // Tomar solo las primeras 6

        for (let i = 0; i < inspecciones.length; i++) {
          const currentRow = startRow + i;
          const inspeccion = inspecciones[i];

          this.logger.log(`  📝 Fila ${currentRow} - Inspección ${i + 1}`);

          try {
            // Columna A: Fecha
            if (inspeccion.date) {
              worksheet.getCell(`A${currentRow}`).value = inspeccion.date;
              this.logger.log(`    ✅ Fecha: ${inspeccion.date}`);
            }

            // Columna C: Inspector
            if (inspeccion.inspector) {
              worksheet.getCell(`C${currentRow}`).value = inspeccion.inspector;
              this.logger.log(`    ✅ Inspector: ${inspeccion.inspector}`);
            }

            // Columnas H/I: Respuesta (SI o NO)
            if (inspeccion.response) {
              const respuesta = inspeccion.response.toLowerCase().trim();

              // Limpiar ambas celdas
              worksheet.getCell(`H${currentRow}`).value = '';
              worksheet.getCell(`I${currentRow}`).value = '';

              if (
                respuesta === 'si' ||
                respuesta === 'sí' ||
                respuesta === 'yes'
              ) {
                worksheet.getCell(`H${currentRow}`).value = 'X';
                this.logger.log(`    ✅ Respuesta: SI (H${currentRow})`);
              } else if (respuesta === 'no') {
                worksheet.getCell(`I${currentRow}`).value = 'X';
                this.logger.log(`    ✅ Respuesta: NO (I${currentRow})`);
              }

              // Centrar las X
              worksheet.getCell(`H${currentRow}`).alignment = {
                vertical: 'middle',
                horizontal: 'center',
              };
              worksheet.getCell(`I${currentRow}`).alignment = {
                vertical: 'middle',
                horizontal: 'center',
              };
            }

            // Columna J: Observaciones
            if (inspeccion.observations?.trim()) {
              worksheet.getCell(`J${currentRow}`).value =
                inspeccion.observations;
              this.logger.log(
                `    ✅ Observaciones: ${inspeccion.observations.substring(0, 30)}...`,
              );
            }

            // Columna M: Firma (imagen base64)
            if (
              inspeccion.signature &&
              inspeccion.signature.startsWith('data:image/')
            ) {
              await this.insertarImagen(
                worksheet,
                inspeccion.signature,
                `M${currentRow}`,
              );
              this.logger.log(`    ✅ Firma insertada en M${currentRow}`);
            }
          } catch (error) {
            this.logger.error(
              `    ❌ Error en fila ${currentRow}: ${error.message}`,
            );
          }
        }

        if (datos.routineInspections.length > maxRows) {
          this.logger.warn(
            `⚠️ Se encontraron ${datos.routineInspections.length} inspecciones, pero solo se procesaron ${maxRows}`,
          );
        }
      }

      // ============================================
      // 2. LLENAR CONCLUSIÓN FINAL
      // ============================================
      const conclusion = datos.finalConclusion?.toLowerCase().trim();

      if (conclusion) {
        this.logger.log(`📊 Conclusión final: "${conclusion}"`);

        // Limpiar las celdas
        worksheet.getCell('H50').value = '';
        worksheet.getCell('I50').value = '';
        worksheet.getCell('H51').value = '';
        worksheet.getCell('I51').value = '';

        // Marcar según la conclusión
        if (conclusion === 'liberado') {
          worksheet.getCell('H51').value = 'X';
          worksheet.getCell('I50').value = 'X';
          this.logger.log('✅ Marcado como LIBERADO (H51 y I50)');
        } else if (
          conclusion === 'no_liberado' ||
          (conclusion.includes('no') && conclusion.includes('liberado'))
        ) {
          worksheet.getCell('H50').value = 'X';
          worksheet.getCell('I51').value = 'X';
          this.logger.log('✅ Marcado como NO LIBERADO (H50 y I51)');
        } else {
          this.logger.warn(`⚠️ Conclusión no reconocida: "${conclusion}"`);
        }

        // Aplicar formato centrado
        ['H50', 'I50', 'H51', 'I51'].forEach((cellRef) => {
          worksheet.getCell(cellRef).alignment = {
            vertical: 'middle',
            horizontal: 'center',
          };
        });
      }

      this.logger.log('✅ Datos del andamio completados exitosamente');
    } catch (error) {
      this.logger.error(
        `❌ Error al llenar datos del andamio: ${error.message}`,
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
        { id: 'section_0', startRow: 15, endRow: 48, name: 'Descripcion' },
      ];

      // Columnas fijas
      const siCol = 'H';
      const noCol = 'I';
      const naCol = 'J';
      const observacionesCol = 'K';

      // Procesar cada sección que exista en las respuestas
      Object.entries(inspection.responses).forEach(
        ([sectionId, sectionResponses], index) => {
          // Encontrar configuración para esta sección
          let sectionConfig = allSections.find((s) => s.id === sectionId);

          // Si no se encuentra por ID exacto, usar por índice
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

          // Procesar preguntas
          Object.entries(sectionResponses).forEach(
            ([_questionId, response]) => {
              if (currentRow > sectionConfig.endRow) {
                this.logger.warn(`Límite excedido en ${sectionConfig.name}`);
                return;
              }

              try {
                // Limpiar celdas
                worksheet.getCell(`${siCol}${currentRow}`).value = '';
                worksheet.getCell(`${noCol}${currentRow}`).value = '';
                worksheet.getCell(`${naCol}${currentRow}`).value = '';

                // Procesar respuesta
                if (response.value !== undefined && response.value !== null) {
                  const valor = String(response.value).toLowerCase().trim();

                  if (
                    valor === 'bueno' ||
                    valor === 'si' ||
                    valor === 'true' ||
                    valor === '1'
                  ) {
                    worksheet.getCell(`${siCol}${currentRow}`).value = 'X';
                  } else if (
                    valor === 'malo' ||
                    valor === 'no' ||
                    valor === 'false' ||
                    valor === '0'
                  ) {
                    worksheet.getCell(`${noCol}${currentRow}`).value = 'X';
                  } else if (valor === 'na' || valor === 'n/a') {
                    worksheet.getCell(`${naCol}${currentRow}`).value = 'X';
                  }
                }

                // Observaciones
                if (response.observacion?.trim()) {
                  worksheet.getCell(`${observacionesCol}${currentRow}`).value =
                    response.observacion;
                }

                currentRow++;
              } catch (error) {
                this.logger.error(
                  `Error en fila ${currentRow}: ${error.message}`,
                );
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
          nombre: 'C8',
          firma: 'G8',
          fecha: 'B47',
          cargo: 'A70',
        },
        supervisor: {
          nombre: 'C9',
          firma: 'G9',
          fecha: 'AF38',
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

        if (sup.supervisorName)
          worksheet.getCell(posiciones.supervisor.nombre).value =
            sup.supervisorName;

        if (
          sup.supervisorSignature &&
          typeof sup.supervisorSignature === 'string' &&
          sup.supervisorSignature.startsWith('data:image/')
        ) {
          await this.insertarImagen(
            worksheet,
            sup.supervisorSignature,
            posiciones.supervisor.firma,
          );
        }

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
      await this.llenarDatosAndamio(worksheet, inspection);

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
