import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Instance } from '../schemas/instance.schema';

@Injectable()
export class ExcelAlturav4Service {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelAlturav4Service.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('ISOLATION_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'alturav4.xlsx');
  }

  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F46'];
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
      worksheet.getCell('D7').value = valores[0] || ''; // Gerencia
      worksheet.getCell('I7').value = valores[1] || ''; // Supervisor

      worksheet.getCell('M7').value = valores[2] || ''; // Inspección N°

      worksheet.getCell('D8').value = valores[3] || ''; // Superintendencia
      worksheet.getCell('I8').value = valores[4] || ''; // lugar de Inspección
      worksheet.getCell('I9').value = valores[5] || ''; // Fecha Inspección
      worksheet.getCell('D9').value = valores[6] || ''; // area

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
      const nameColumn = 'C';
      const cargoColumn = 'I';
      const firmaColumn = 'M';

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
      this.logger.log('Iniciando llenado de secciones');

      if (!instance.sections || instance.sections.length === 0) {
        this.logger.warn('No se encontraron secciones en la instancia');
        return;
      }

      const sectionPositions = [
        { startRow: 33, name: 'A. GENERAL' },
        { startRow: 59, name: 'B. PUNTOS DE ANCLAJE' }, // Ajustar según la plantilla
        { startRow: 64, name: 'C. LINEAS DE VIDA HORIZONTALES' },
        { startRow: 78, name: 'D. LINEAS DE VIDA HORIZONTALES' },
        { startRow: 85, name: 'D. LINEAS DE ADVERTENCIA' }, 
        { startRow: 95, name: 'E. ESCALERAS' },
        { startRow: 124, name: 'F. EQUIPOS ELEVADORES DE PERSONAS' }, // Ajustar según la plantilla
        { startRow: 149, name: 'F. EQUIPO CANASTILLO PARA LA ELEVACIÓN DE PERSONAS' }, // Ajustar según la plantilla
        { startRow: 162, name: 'F. ANDAMIOS' }, // Ajustar según la plantilla
      ];

      // Columnas para las respuestas
      const responseColumn = 'I'; // Columna donde van las respuestas (0, 1, 2, 3, N/A)
      const commentsColumn = 'J'; // Columna de comentarios

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
    worksheet.getCell('B181').value = instance.aspectosPositivos || '';
    worksheet.getCell('B185').value = instance.aspectosAdicionales || '';
  }

 /**
 * Método para llenar la tabla de equipo de trabajo / personal involucrado
 * Estructura: 2 columnas (izquierda y derecha) x múltiples filas
 * Columnas: Nombre y Apellido (A, C) | C.I. (B, D)
 */
private async llenarEquipoDeTrabajo(
  worksheet: ExcelJS.Worksheet,
  instance: Instance,
) {
  try {
    this.logger.log('Iniciando llenado del equipo de trabajo');

    // Verificar que existe el personal involucrado
    if (
      !instance.personalInvolucrado ||
      instance.personalInvolucrado.length === 0
    ) {
      this.logger.warn(
        'No se encontró personal involucrado en la instancia',
      );
      return;
    }

    const startRow = 190; 
    const maxRowsPerPage = 6; 

    const nameColumn1 = 'B'; 
    const ciColumn1 = 'G'; 
    const nameColumn2 = 'H'; 
    const ciColumn2 = 'M'; 

    let personIndex = 0;
    const personalList = instance.personalInvolucrado;

    // Llenar dos columnas de forma horizontal (izquierda y derecha)
    for (let rowOffset = 0; rowOffset < maxRowsPerPage; rowOffset++) {
      const currentRow = startRow + rowOffset;

      // ============ LLENAR COLUMNA IZQUIERDA ============
      if (personIndex < personalList.length) {
        const person1 = personalList[personIndex];

        try {
          // Validar que el registro tiene datos
          if (person1.nombre || person1.ci) {
            // Nombre y Apellido (columna A)
            if (person1.nombre) {
              worksheet.getCell(`${nameColumn1}${currentRow}`).value =
                person1.nombre;
              this.logger.debug(
                `Nombre ingresado en A${currentRow}: ${person1.nombre}`,
              );
            }

            // C.I. (columna B)
            if (person1.ci) {
              worksheet.getCell(`${ciColumn1}${currentRow}`).value = person1.ci;
              this.logger.debug(
                `C.I. ingresado en B${currentRow}: ${person1.ci}`,
              );
            }

          }
        } catch (error) {
          this.logger.error(
            `Error al procesar personal ${personIndex + 1} (columna izquierda): ${error.message}`,
          );
        }

        personIndex++;
      }

      // ============ LLENAR COLUMNA DERECHA ============
      if (personIndex < personalList.length) {
        const person2 = personalList[personIndex];

        try {
          // Validar que el registro tiene datos
          if (person2.nombre || person2.ci) {
            // Nombre y Apellido (columna C)
            if (person2.nombre) {
              worksheet.getCell(`${nameColumn2}${currentRow}`).value =
                person2.nombre;
              this.logger.debug(
                `Nombre ingresado en C${currentRow}: ${person2.nombre}`,
              );
            }

            // C.I. (columna D)
            if (person2.ci) {
              worksheet.getCell(`${ciColumn2}${currentRow}`).value = person2.ci;
              this.logger.debug(
                `C.I. ingresado en D${currentRow}: ${person2.ci}`,
              );
            }

          }
        } catch (error) {
          this.logger.error(
            `Error al procesar personal ${personIndex + 1} (columna derecha): ${error.message}`,
          );
        }

        personIndex++;
      }
    }

    // Registrar advertencia si hay más personal del que cabe
    if (personalList.length > personIndex) {
      this.logger.warn(
        `Se encontraron ${personalList.length} personas, pero solo se pueden mostrar ${personIndex} en la tabla`,
      );
    }

    this.logger.log(
      `Equipo de trabajo completado. Se ingresaron ${Math.min(personalList.length, personIndex)} personas`,
    );
  } catch (error) {
    this.logger.error(
      `Error al llenar equipo de trabajo: ${error.message}`,
    );
    throw new Error(
      `Error al llenar el equipo de trabajo: ${error.message}`,
    );
  }
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
      await this.llenarEquipoDeTrabajo(worksheet, instance);

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
