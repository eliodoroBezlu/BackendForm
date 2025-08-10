import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Instance } from '../schemas/instance.schema';

@Injectable()
export class ExcelElectricoActosService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelElectricoActosService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('ISOLATION_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'electricosActos.xlsx');
  }

  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F52'];
  }

  canHandle(templateCode: string): boolean {
    const supportedCodes = this.getSupportedTemplateCodes();
    return supportedCodes.some((code) =>
      templateCode.toUpperCase().includes(code.toUpperCase()),
    );
  }

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

  private getCellCoordinates(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, '');
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ''), 10);

    let col = 0;
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }

    return { row, col };
  }

  private async llenarListaVerificacion(
    worksheet: ExcelJS.Worksheet,
    instance: Instance,
  ) {
    try {
      const verificationList = instance.verificationList;
      // Fallback: usar los valores por posición

      const valores = Array.from(verificationList.values());

      // Mapeo basado en la estructura real de datos
      worksheet.getCell('C7').value = valores[0] || ''; // Gerencia
      worksheet.getCell('H7').value = valores[1] || ''; // Supervisor

      worksheet.getCell('L7').value = valores[2] || ''; // Inspección N°

      worksheet.getCell('C8').value = valores[3] || ''; // Superintendencia
      worksheet.getCell('H8').value = valores[4] || ''; // lugar de Inspección
      worksheet.getCell('H9').value = valores[5] || ''; // Fecha Inspección
      worksheet.getCell('C9').value = valores[6] || ''; // area

      this.logger.log('Lista de verificación completada exitosamente');
    } catch (error) {
      this.logger.error(
        `Error al llenar lista de verificación: ${error.message}`,
      );
      throw error;
    }
  }

  private async llenarEquipoInspeccion(
    worksheet: ExcelJS.Worksheet,
    instance: Instance,
  ) {
    try {
      this.logger.log('Iniciando llenado del equipo de inspección');

      // Verificar que existe el equipo de inspección
      if (!instance.inspectionTeam || instance.inspectionTeam.length === 0) {
        this.logger.warn('No se encontró equipo de inspección en la instancia');
        return;
      }

      // Filas donde se insertarán los datos del equipo (13-18 según tu comentario)
      const startRow = 13;
      const maxMembers = 6; // Máximo 6 miembros (filas 13-18)

      // Columnas según tu estructura: Nombre (B), Cargo (I), Firma (K)
      const nameColumn = 'B';
      const cargoColumn = 'H';
      const firmaColumn = 'L';

      // Llenar datos de cada miembro del equipo
      for (
        let i = 0;
        i < Math.min(instance.inspectionTeam.length, maxMembers);
        i++
      ) {
        const member = instance.inspectionTeam[i];
        const currentRow = startRow + i;

        try {
          // Nombre del miembro
          if (member.nombre) {
            worksheet.getCell(`${nameColumn}${currentRow}`).value =
              member.nombre;
            
          }

          // Cargo del miembro
          if (member.cargo) {
            worksheet.getCell(`${cargoColumn}${currentRow}`).value =
              member.cargo;
            
          }

          // Firma del miembro (si es base64, insertar como imagen)
          if (member.firma) {
            // Verificar si es una imagen base64
            if (member.firma.startsWith('data:image/')) {
              await this.insertarImagen(
                worksheet,
                member.firma,
                `${firmaColumn}${currentRow}`,
              );
              
            }
          }

          // Ajustar altura de la fila para acomodar imágenes si es necesario
          worksheet.getRow(currentRow).height = Math.max(
            25,
            worksheet.getRow(currentRow).height || 15,
          );
        } catch (memberError) {
          this.logger.error(
            `Error al procesar miembro ${i + 1}: ${memberError.message}`,
          );
          // Continuar con el siguiente miembro en caso de error
        }
      }

      // Si hay más miembros de los que caben, registrar advertencia
      if (instance.inspectionTeam.length > maxMembers) {
        this.logger.warn(
          `El equipo tiene ${instance.inspectionTeam.length} miembros, pero solo se pueden mostrar ${maxMembers} en el template`,
        );
      }

      this.logger.log(
        `Equipo de inspección completado exitosamente. Procesados ${Math.min(instance.inspectionTeam.length, maxMembers)} miembros`,
      );
    } catch (error) {
      this.logger.error(
        `Error al llenar equipo de inspección: ${error.message}`,
      );
      throw new Error(
        `Error al llenar el equipo de inspección: ${error.message}`,
      );
    }
  }

  private async llenarSecciones(
    worksheet: ExcelJS.Worksheet,
    instance: Instance,
  ) {
    try {
      
      if (!instance.sections || instance.sections.length === 0) {
        this.logger.warn('No se encontraron secciones en la instancia');
        return;
      }

      const sectionPositions = [
        { startRow: 33, name: 'A.  ASPECTOS GENERALES' },
        { startRow: 41, name: 'B. ASPECTOS GENERALES' }, // Ajustar según la plantilla
        { startRow: 45, name: 'C. DESCONEXIÓN' },
        { startRow: 50, name: 'D. VERIFICACIÓN VISUAL  DE DESCONEXIÓN' }, // Ajustar según la plantilla
        { startRow: 54, name: 'E. LIBERACIÓN DE ENERGÍA ELÉCTRICA ALMACENADA' },
        { startRow: 61, name: 'F. LIBERACIÓN DE ENERGÍA MECÁNICA ALMACENADA' }, // Ajustar según la plantilla
        { startRow: 64, name: 'F. BLOQUEO Y ETIQUETADO' },
        { startRow: 69, name: 'F. VERIFICACIÓN DE TENSIÓN ELÉCTRICA' },
        { startRow: 77, name: 'F. PUESTA A TIERRA' },
      ];

      // Columnas para las respuestas
      const responseColumn = 'H'; // Columna donde van las respuestas (0, 1, 2, 3, N/A)
      const commentsColumn = 'I'; // Columna de comentarios

      // Procesar cada sección de la instancia
      for (
        let sectionIndex = 0;
        sectionIndex < instance.sections.length;
        sectionIndex++
      ) {
        const section = instance.sections[sectionIndex];
        const sectionInfo = sectionPositions[sectionIndex];

        if (!sectionInfo) {
          this.logger.warn(
            `No se encontró configuración para la sección en posición ${sectionIndex}`,
          );
          continue;
        }

        
        let currentRow = sectionInfo.startRow;

        for (let i = 0; i < section.questions.length; i++) {
          const question = section.questions[i];

          try {
            // Insertar la respuesta
            if (question.response !== undefined && question.response !== null) {
              const cellRef = `${responseColumn}${currentRow}`;
              worksheet.getCell(cellRef).value = question.response;
            }

            // Insertar comentario si existe
            if (question.comment && question.comment.trim() !== '') {
              const commentCellRef = `${commentsColumn}${currentRow}`;
              worksheet.getCell(commentCellRef).value = question.comment;
            }

            currentRow++; // Pasar a la siguiente fila para la próxima pregunta
          } catch (questionError) {
            this.logger.error(
              `Error al procesar pregunta ${i + 1} en fila ${currentRow}: ${questionError.message}`,
            );
            currentRow++; // Continuar con la siguiente pregunta
          }
        }
      }
      this.logger.log('Secciones completadas exitosamente');
    } catch (error) {
      this.logger.error(`Error al llenar secciones: ${error.message}`);
      throw new Error(`Error al llenar las secciones: ${error.message}`);
    }
  }

  private async llenarConclusiones(
    worksheet: ExcelJS.Worksheet,
    instance: Instance,
  ) {
    this.logger.log('Iniciando llenado de conclusiones y recomendaciones');
    // Aquí puedes implementar la lógica para llenar las conclusiones y recomendaciones
    worksheet.getCell('A84').value = instance.aspectosPositivos || '';
    worksheet.getCell('A87').value = instance.aspectosAdicionales || '';
  }

  async generateExcel(instance: Instance): Promise<Buffer> {
    try {
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

      // 3. Obtener la primera hoja de trabajo
      let worksheet: ExcelJS.Worksheet | undefined = workbook.worksheets[0];

      if (!worksheet) {
        // Intentar con nombres comunes si la primera no existe
        worksheet =
          workbook.getWorksheet('Hoja1') ||
          workbook.getWorksheet('Sheet1') ||
          workbook.getWorksheet('Formulario') ||
          workbook.getWorksheet('Template');
      }

      if (!worksheet) {
        const availableSheets = workbook.worksheets
          .map((sheet) => sheet.name)
          .join(', ');
        throw new Error(
          `No se pudo encontrar una hoja de trabajo válida. Hojas disponibles: ${availableSheets}`,
        );
      }

      this.logger.log(`Generando Excel usando hoja: "${worksheet.name}"`);

      // FASE 1: Solo llenar la Lista de Verificación
      await this.llenarListaVerificacion(worksheet, instance);
      await this.llenarEquipoInspeccion(worksheet, instance);
      await this.llenarSecciones(worksheet, instance);
      await this.llenarConclusiones(worksheet, instance);

      const excelBuffer = await workbook.xlsx.writeBuffer();
      this.logger.log('Excel generado exitosamente');
      return Buffer.from(excelBuffer);
    } catch (error) {
      this.logger.error(`Error al generar Excel: ${error.message}`);
      throw new Error(
        `Error al generar el archivo Excel de aislamiento: ${error.message}`,
      );
    }
  }
}
