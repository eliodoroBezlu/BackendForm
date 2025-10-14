import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Instance } from '../schemas/instance.schema';

@Injectable()
export class ExcelIsopV7Service {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelIsopV7Service.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('ISOLATION_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'isopPrueba.xlsx');
  }

  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F12'];
  }

  canHandle(templateCode: string): boolean {
    const supportedCodes = this.getSupportedTemplateCodes();
    return supportedCodes.some((code) =>
      templateCode.toUpperCase().includes(code.toUpperCase()),
    );
  }

  // ✅ NUEVO: Método para cargar workbook de forma segura
  private async loadWorkbookSafely(): Promise<ExcelJS.Workbook> {
    try {
      const fs = require('fs');

      if (!fs.existsSync(this.templatePath)) {
        throw new Error(
          `El archivo template no existe en: ${this.templatePath}`,
        );
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath);

      // ✅ LIMPIEZA: Eliminar tablas y filtros problemáticos
      workbook.worksheets.forEach((worksheet) => {
        try {
          // Eliminar tablas (tables) para evitar corrupción
          if ((worksheet as any).tables && (worksheet as any).tables.length > 0) {
            this.logger.warn(
              `Se encontraron ${(worksheet as any).tables.length} tablas en "${worksheet.name}", eliminándolas...`,
            );
            (worksheet as any).tables = [];
          }

          // Eliminar filtros automáticos
          if (worksheet.autoFilter) {
            this.logger.warn(
              `Se encontró autoFilter en "${worksheet.name}", eliminándolo...`,
            );
            worksheet.autoFilter = undefined;
          }
        } catch (error) {
          this.logger.warn(
            `No se pudo limpiar worksheet "${worksheet.name}": ${error.message}`,
          );
        }
      });

      this.logger.log('Workbook cargado y limpiado exitosamente');
      return workbook;
    } catch (error) {
      this.logger.error(`Error al cargar workbook: ${error.message}`);
      throw error;
    }
  }

  // ✅ NUEVO: Método para escribir workbook de forma segura
  private async writeWorkbookSafely(
    workbook: ExcelJS.Workbook,
  ): Promise<Buffer> {
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error(`Error al escribir workbook: ${error.message}`);
      throw error;
    }
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
      const valores = Array.from(verificationList.values());

      worksheet.getCell('C8').value = valores[0] || '';
      worksheet.getCell('H8').value = valores[1] || '';
      worksheet.getCell('N8').value = valores[2] || '';
      worksheet.getCell('C9').value = valores[3] || '';
      worksheet.getCell('H9').value = valores[4] || '';
      worksheet.getCell('H10').value = valores[5] || '';
      worksheet.getCell('C10').value = valores[6] || '';

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

      if (!instance.inspectionTeam || instance.inspectionTeam.length === 0) {
        this.logger.warn('No se encontró equipo de inspección en la instancia');
        return;
      }

      const startRow = 14;
      const maxMembers = 6;

      const nameColumn = 'B';
      const cargoColumn = 'F';
      const firmaColumn = 'N';

      for (
        let i = 0;
        i < Math.min(instance.inspectionTeam.length, maxMembers);
        i++
      ) {
        const member = instance.inspectionTeam[i];
        const currentRow = startRow + i;

        try {
          if (member.nombre) {
            worksheet.getCell(`${nameColumn}${currentRow}`).value =
              member.nombre;
          }

          if (member.cargo) {
            worksheet.getCell(`${cargoColumn}${currentRow}`).value =
              member.cargo;
          }

          if (member.firma && member.firma.startsWith('data:image/')) {
            await this.insertarImagen(
              worksheet,
              member.firma,
              `${firmaColumn}${currentRow}`,
            );
          }

          worksheet.getRow(currentRow).height = Math.max(
            25,
            worksheet.getRow(currentRow).height || 15,
          );
        } catch (memberError) {
          this.logger.error(
            `Error al procesar miembro ${i + 1}: ${memberError.message}`,
          );
        }
      }

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
      this.logger.log('Iniciando llenado de secciones');

      if (!instance.sections || instance.sections.length === 0) {
        this.logger.warn('No se encontraron secciones en la instancia');
        return;
      }

      const sectionPositions = [
        { startRow: 34, name: 'A. ORDEN Y ASEO (5Ss)' },
        { startRow: 50, name: 'B. General' },
        { startRow: 57, name: 'C. Extintores Portátiles' },
        { startRow: 67, name: 'D. Sistema de Emergencias' },
        { startRow: 73, name: 'E. ELEMENTOS DE PROTECCIÓN PERSONAL' },
        { startRow: 84, name: 'F. HERRAMIENTAS DE MANO' },
        { startRow: 98, name: 'G. Oficinas y otros ambientes' },
        { startRow: 109, name: 'H. Calefactores Verticales...' },
        { startRow: 109, name: 'I. Cafeterías' },
        { startRow: 119, name: 'J. Duchas, Vestidores y Servicios Higiénicos' },
        { startRow: 147, name: 'K. SEÑALIZACIÓN' },
        { startRow: 158, name: 'L. VEHÍCULOS' },
      ];

      const responseColumn = 'F';
      const commentsColumn = 'G';

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
            if (question.response !== undefined && question.response !== null) {
              const cellRef = `${responseColumn}${currentRow}`;
              worksheet.getCell(cellRef).value = question.response;
            }

            if (question.comment && question.comment.trim() !== '') {
              const commentCellRef = `${commentsColumn}${currentRow}`;
              worksheet.getCell(commentCellRef).value = question.comment;
            }

            currentRow++;
          } catch (questionError) {
            this.logger.error(
              `Error al procesar pregunta ${i + 1} en fila ${currentRow}: ${questionError.message}`,
            );
            currentRow++;
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
    worksheet.getCell('A175').value = instance.aspectosPositivos || '';
    worksheet.getCell('A178').value = instance.aspectosAdicionales || '';
  }

  async generateExcel(instance: Instance): Promise<Buffer> {
    try {
      // ✅ CAMBIO: Usar método seguro de carga
      const workbook = await this.loadWorkbookSafely();

      let worksheet: ExcelJS.Worksheet | undefined = workbook.worksheets[0];

      if (!worksheet) {
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

      await this.llenarListaVerificacion(worksheet, instance);
      await this.llenarEquipoInspeccion(worksheet, instance);
      await this.llenarSecciones(worksheet, instance);
      await this.llenarConclusiones(worksheet, instance);

      // ✅ CAMBIO: Usar método seguro de escritura
      const excelBuffer = await this.writeWorkbookSafely(workbook);
      this.logger.log('Excel generado exitosamente');
      return excelBuffer;
    } catch (error) {
      this.logger.error(`Error al generar Excel: ${error.message}`);
      throw new Error(
        `Error al generar el archivo Excel de aislamiento: ${error.message}`,
      );
    }
  }
}