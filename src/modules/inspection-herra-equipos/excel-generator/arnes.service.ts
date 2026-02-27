import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';

@Injectable()
export class ExcelArnestService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelArnestService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'arnes.xlsx');
  }

  /**
   * Códigos de template soportados: 1.02.P06.F37
   */
  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F19'];
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
      return codeMatch && revision === '5';
    }

    return codeMatch;
  }

  private escribirObservacionConPrefijo(
    worksheet: ExcelJS.Worksheet,
    columnLetter: string,
    row: number,
    observation: string,
    prefix: string,
  ) {
    const cell = worksheet.getCell(`${columnLetter}${row}`);
    const textoActual = cell.value ? String(cell.value) : '';
    const nuevaObservacion = `${prefix}: ${observation}`;

    // Si ya hay texto, agregamos salto de línea; si no, ponemos el texto directo
    if (textoActual) {
      // Evitamos duplicar si por error se procesa dos veces
      if (!textoActual.includes(nuevaObservacion)) {
        cell.value = `${textoActual}\n${nuevaObservacion}`;
      }
    } else {
      cell.value = nuevaObservacion;
    }

    // Importante: Activar ajuste de texto para que se vean los saltos de línea
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    };
  }

  /**
   * Inserta una imagen base64 en una celda específica del worksheet
   */
  private async insertarImagen(
    worksheet: ExcelJS.Worksheet,
    base64Image: string,
    cellRef: string,
    heightRatio: number = 1.0, // 👈 Nuevo parámetro, por defecto llena todo
  ) {
    try {
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const imageId = worksheet.workbook.addImage({
        buffer: imageBuffer as any,
        extension: 'png',
      });

      const { row, col } = this.getCellCoordinates(cellRef);

      // Calcular el borde inferior (bottom-right)
      // Si row es 40, el top es 39. El bottom normal es 40.
      // Si heightRatio es 0.7, el bottom será 39 + 0.7 = 39.7
      const rowTop = row - 1;
      const rowBottom = rowTop + heightRatio;

      worksheet.addImage(imageId, {
        tl: { col: col - 1, row: rowTop } as ExcelJS.Anchor,
        br: { col: col, row: rowBottom } as ExcelJS.Anchor, // 👈 Usamos el ratio aquí
        editAs: 'oneCell',
      });

      // Asegurar altura mínima de fila para que se vea bien
      // worksheet.getRow(row).height = 40; 
    } catch (error) {
      this.logger.error(`Error al insertar imagen: ${error.message}`);
      // No lanzamos error para no detener todo el reporte si falla una imagen
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

      worksheet.getCell('B4').value = valores[0] || ''; // EMPRESA
      worksheet.getCell('N4').value = valores[1] || ''; // FECHA
      worksheet.getCell('Z4').value = valores[2] || ''; // OPERADOR

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

  private async llenarDatosArnes(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      if (!inspection.outOfService) {
        this.logger.warn('No se encontraron datos específicos del vehículo');
        return;
      }

      this.logger.log('Iniciando llenado de datos específicos del vehículo');

      // Tipo de inspección
      if (inspection.outOfService?.status) {
        const tipoInspeccion = inspection.outOfService?.status?.toLowerCase();
        await this.marcarCasilla(
          worksheet,
          'D57',
          tipoInspeccion.includes('no'),
          true,
        );
        await this.marcarCasilla(
          worksheet,
          'F57',
          tipoInspeccion.includes('si'),
          true,
        );
      }

      if (inspection.outOfService?.fechaCorrecion) {
        worksheet.getCell('K57').value = inspection.outOfService.fechaCorrecion;
      }

      this.logger.log('Datos específicos del vehículo completados');
    } catch (error) {
      this.logger.error(`Error al llenar datos del vehículo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Llena las respuestas de las preguntas de inspección
   */
  /**
   * Llena las respuestas de las preguntas de inspección
   */
 private async llenarRespuestas(
    workbook: ExcelJS.Workbook,
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('Iniciando llenado de respuestas');

      // 1. Obtener las dos hojas
      const sheetAnverso =
        workbook.getWorksheet('ANVERSO') || workbook.worksheets[0];
      const sheetReverso =
        workbook.getWorksheet('REVERSO') || workbook.worksheets[1];

      if (!sheetAnverso || !sheetReverso) {
        throw new Error('No se encontraron las hojas ANVERSO y REVERSO');
      }

      if (
        !inspection.responses ||
        Object.keys(inspection.responses).length === 0
      ) {
        this.logger.warn('No se encontraron respuestas en la inspección');
        return;
      }

      // 2. CONFIGURACIÓN COMPLETA (ANVERSO Y REVERSO)
      const sectionConfig = {
        // ==========================================
        // HOJA 1: ANVERSO (Arnés y Autoretráctil)
        // ==========================================
        section_0: {
          sheet: 'ANVERSO',
          startRow: 9,
          endRow: 34,
          name: 'ARNES DE CUERPO ENTERO',
          hasSubsections: true,
        },
        section_0_sub0: {
          sheet: 'ANVERSO',
          startRow: 8,
          endRow: 10,
          name: 'Caracteristicas Arnés',
          type: 'inline_response',
          columns: { target: 'A' },
          options: { mode: 'append', separator: ' : ' },
        },
        section_0_sub1: {
          sheet: 'ANVERSO',
          startRow: 9,
          endRow: 17,
          name: 'CORREA O TEJIDO',
          shortName: 'Arnés',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' }, // Ajusta 'AC' a tu columna real
        },
        section_0_sub2: {
          sheet: 'ANVERSO',
          startRow: 19,
          endRow: 21,
          name: 'ARGOLLAS',
          shortName: 'Arnés',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' },
        },
        section_0_sub3: {
          sheet: 'ANVERSO',
          startRow: 23,
          endRow: 28,
          name: 'HEBILLAS',
          shortName: 'Arnés',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' },
        },
        section_0_sub4: {
          sheet: 'ANVERSO',
          startRow: 30,
          endRow: 34,
          name: 'ELEMENTOS PLÁSTICOS',
          shortName: 'Arnés',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' },
        },
        
        // --- Sección 1: Autoretráctil (Anverso) ---
        section_1: {
          sheet: 'ANVERSO',
          startRow: 8,
          endRow: 33,
          name: 'AUTORETRACTIL PERSONAL',
          hasSubsections: true,
        },
        section_1_sub0: {
          sheet: 'ANVERSO',
          startRow: 9,
          endRow: 15,
          name: 'Caracteristicas Retráctil',
          type: 'inline_response',
          columns: { target: 'K' },
          options: { mode: 'append', separator: ' : ' },
        },
        section_1_sub1: {
          sheet: 'ANVERSO',
          startRow: 17,
          endRow: 20,
          name: 'BLOQUE RETRÁCTIL',
          shortName: 'Retráctil',
          type: 'boolean',
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' },
        },
        section_1_sub2: {
          sheet: 'ANVERSO',
          startRow: 22,
          endRow: 25,
          name: 'ABSORBEDOR',
          shortName: 'Retráctil',
          type: 'boolean',
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' },
        },
        section_1_sub3: {
          sheet: 'ANVERSO',
          startRow: 27,
          endRow: 33,
          name: 'LÍNEA DE VIDA',
          shortName: 'Retráctil',
          type: 'boolean',
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' },
        },
        section_1_sub4: {
          sheet: 'ANVERSO',
          startRow: 27,
          endRow: 33,
          name: 'GANCHO',
          shortName: 'Retráctil',
          type: 'boolean',
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' },
        },

        // ==========================================
        // HOJA 2: REVERSO (Línea de Vida / Eslinga)
        // ==========================================
        section_2: {
          sheet: 'REVERSO',
          startRow: 8, // Ajusta según tu template
          endRow: 34,
          name: 'CONECTORES DE TEJIDO TRENZADO Y CABLE DE ACERO ',
          hasSubsections: true,
        },
        section_2_sub0: {
          sheet: 'REVERSO',
          startRow: 8, 
          endRow: 10,
          name: 'CARACTERISITICAS',
          type: 'inline_response',
          columns: { target: 'A' }, // Ajusta columna
          options: { mode: 'append', separator: ' : ' },
        },
        section_2_sub1: {
          sheet: 'REVERSO',
          startRow: 9, 
          endRow: 12,
          name: 'TEJIDO TRENZADO',
         type: 'boolean',
          // ⚠️ AJUSTA LAS COLUMNAS A TU TEMPLATE DEL REVERSO
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' }, 
        },
        section_2_sub2: {
          sheet: 'RE1VERSO',
          startRow: 14,
          endRow: 20,
          name: 'GANCHO DE SEGURIDAD',
          shortName: 'Eslinga',
          type: 'boolean',
          // ⚠️ AJUSTA LAS COLUMNAS A TU TEMPLATE DEL REVERSO
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' } 
        },
        section_2_sub3: {
          sheet: 'REVERSO',
          startRow: 22,
          endRow: 26,
          name: 'ABSORBEDOR DE ENERGÍA',
          shortName: 'Eslinga',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' },
        },
        section_2_sub4: {
          sheet: 'REVERSO',
          startRow: 28,
          endRow: 34,
          name: 'CABLE DE ACERO (Si aplica)',
          shortName: 'Eslinga',
          type: 'boolean',
          columns: { si: 'G', no: 'H', na: 'I', observaciones: 'Y' },
        },

         section_3: {
          sheet: 'REVERSO',
          startRow: 8, // Ajusta según tu template
          endRow: 29,
          name: 'CONECTORES DE ANCLAJE  ',
          hasSubsections: true,
        },
        section_3_sub0: {
          sheet: 'REVERSO',
          startRow: 8, 
          endRow: 10,
          name: 'CARACTERISITICAS',
          type: 'inline_response',
          columns: { target: 'A' }, // Ajusta columna
          options: { mode: 'append', separator: ' : ' },
        },
        section_3_sub1: {
          sheet: 'REVERSO',
          startRow: 9, 
          endRow: 15,
          name: 'CORREA O TEJIDO TRENZADO ',
          type: 'boolean',
          // ⚠️ AJUSTA LAS COLUMNAS A TU TEMPLATE DEL REVERSO
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' }, 
        },
        section_3_sub2: {
          sheet: 'REVERSO',
          startRow: 17,
          endRow: 29,
          name: 'HERRAJE DE ANCLAJE (Anillo D, Anclaje para viga I/H, Perno en D, Mosquetón y Manuclave)',
          shortName: 'Eslinga',
          type: 'boolean',
          // ⚠️ AJUSTA LA COLUMNAS A TU TEMPLATE DEL REVERSO
          columns: { si: 'V', no: 'W', na: 'X', observaciones: 'Y' }, 
        },
      };

      // 3. PROCESAMIENTO
      Object.entries(inspection.responses).forEach(
        ([sectionId, sectionResponses]) => {
          const hasSubsections = this.tieneSubseccionesAnidadas(sectionResponses);

          // --- Función auxiliar para procesar seleccionando la hoja correcta ---
          const procesarItem = (id: string, responses: any) => {
            const config = sectionConfig[id];
            
            if (config) {
              // 🔥 SELECCIÓN DINÁMICA DE HOJA
              const targetSheet = config.sheet === 'REVERSO' ? sheetReverso : sheetAnverso;
              
              if (config.hasSubsections) {
                 this.logger.log(`⏭️ Contenedor ${id} - Hoja: ${config.sheet}`);
                 return;
              }

              this.logger.log(`📋 Procesando ${id} en hoja ${targetSheet.name}`);
              this.procesarSeccion(targetSheet, config, responses);
            } else {
              this.logger.warn(`⚠️ Config no encontrada para: ${id}`);
            }
          };
          // ------------------------------------------------------------------

          if (hasSubsections) {
            this.logger.log(`📦 Sección ${sectionId} con subsecciones`);
            Object.entries(sectionResponses as Record<string, any>).forEach(
              ([subId, subResponses]) => {
                if (subId.startsWith('sub')) {
                  procesarItem(`${sectionId}_${subId}`, subResponses);
                }
              },
            );
          } else {
            // Caso raro: sección sin subsecciones
             procesarItem(sectionId, sectionResponses);
          }
        },
      );

      this.logger.log('✅ Respuestas completadas exitosamente');
    } catch (error) {
      this.logger.error(`❌ Error al llenar respuestas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica si una sección contiene subsecciones anidadas
   */
  private tieneSubseccionesAnidadas(sectionResponses: any): boolean {
    return (
      sectionResponses &&
      typeof sectionResponses === 'object' &&
      Object.keys(sectionResponses).some((key) => key.startsWith('sub'))
    );
  }

  /**
   * Procesa una sección o subsección según su tipo
   */
  private procesarSeccion(
    worksheet: ExcelJS.Worksheet,
    sectionConfig: any,
    sectionResponses: any,
  ) {
    const sectionType = sectionConfig.type || 'boolean';
    this.logger.log(
      `📋 Procesando: ${sectionConfig.name} (tipo: ${sectionType}, filas ${sectionConfig.startRow}-${sectionConfig.endRow})`,
    );

    const numQuestions = Object.keys(sectionResponses).length;
    this.logger.log(`  📊 Número de preguntas: ${numQuestions}`);

    let currentRow = sectionConfig.startRow;

    Object.entries(sectionResponses as Record<string, any>).forEach(
      ([questionId, response], index) => {
        if (currentRow > sectionConfig.endRow) {
          this.logger.warn(
            `  ⚠️ Límite de filas excedido en ${sectionConfig.name}`,
          );
          return;
        }

        try {
          // ✅ CASO ESPECIAL: Respuesta en misma celda
          if (sectionType === 'inline_response') {
            this.procesarSeccionInlineResponse(
              worksheet,
              sectionConfig,
              currentRow,
              response,
            );
          }
          // ✅ CASO ESPECIAL: Texto + respuesta en celdas separadas
          else if (sectionType === 'text_response') {
            this.procesarSeccionTextoRespuesta(
              worksheet,
              sectionConfig,
              currentRow,
              response,
            );
          }
          // ✅ CASO NORMAL: Sección bueno/malo
          else if (sectionType === 'boolean') {
            this.procesarSeccionBoolean(
              worksheet,
              sectionConfig,
              currentRow,
              response,
            );
          }

          currentRow++;
        } catch (error) {
          this.logger.error(
            `  ❌ Error en fila ${currentRow}: ${error.message}`,
          );
          currentRow++;
        }
      },
    );
  }

  private procesarSeccionTextoRespuesta(
    worksheet: ExcelJS.Worksheet,
    sectionConfig: any,
    row: number,
    response: any,
  ) {
    const { columns } = sectionConfig;
    const textCell = worksheet.getCell(`${columns.text}${row}`);
    const responseCell = worksheet.getCell(`${columns.response}${row}`);

    // ✅ LEER el texto existente (NO sobreescribir)
    const textoExistente = textCell.value?.toString()?.trim() || '';
    this.logger.log(`  📝 Fila ${row} - Texto existente: "${textoExistente}"`);

    // ✅ ESCRIBIR solo la respuesta (N/A, Bueno, Malo, etc.)
    if (response.value !== undefined && response.value !== null) {
      const valorRespuesta = String(response.value).trim();

      // Normalizar "N/A" y variantes
      const respuestaNormalizada = valorRespuesta.toLowerCase().includes('n/a')
        ? 'N/A'
        : valorRespuesta;

      responseCell.value = respuestaNormalizada;
      this.logger.log(
        `    ✅ Respuesta en ${columns.response}${row}: "${respuestaNormalizada}"`,
      );
    }

    // ✅ Agregar observación si existe (en columna siguiente o misma según necesidad)
    if (response.observacion?.trim()) {
      // Buscar columna siguiente automáticamente (ej: si response='B', usar 'C')
      const responseColNum = this.getExcelColumnNumber(columns.response);
      const obsColLetter = this.getExcelColumnLetter(responseColNum + 1);

      worksheet.getCell(`${obsColLetter}${row}`).value = response.observacion;
      this.logger.log(
        `    📝 Observación en ${obsColLetter}${row}: "${response.observacion}"`,
      );
    }
  }

  /**
   * Procesa secciones de tipo "boolean" (bueno/malo)
   */
  private procesarSeccionBoolean(
    worksheet: ExcelJS.Worksheet,
    sectionConfig: any,
    row: number,
    response: any,
  ) {
    const { columns } = sectionConfig;

    // 1. Limpieza de celdas (CORREGIDO)
    // Antes estabas limpiando 'bueno'/'malo' cuando chequeabas 'si'/'no'
    if (columns.bueno) worksheet.getCell(`${columns.bueno}${row}`).value = '';
    if (columns.malo) worksheet.getCell(`${columns.malo}${row}`).value = '';

    if (columns.si) worksheet.getCell(`${columns.si}${row}`).value = '';
    if (columns.no) worksheet.getCell(`${columns.no}${row}`).value = '';
    if (columns.na) worksheet.getCell(`${columns.na}${row}`).value = '';

    // Marcar respuesta
    if (response.value !== undefined && response.value !== null) {
      const valor = String(response.value).toLowerCase().trim();
      const marca = 'X'; // O el valor que uses para marcar

      // GRUPO POSITIVO (Bueno / Si)
      if (['bueno', 'si', 'true', '1'].includes(valor)) {
        // Si existe columna 'bueno', marcamos
        if (columns.bueno)
          worksheet.getCell(`${columns.bueno}${row}`).value = marca;
        // Si existe columna 'si', marcamos (ESTO FALTABA)
        if (columns.si) worksheet.getCell(`${columns.si}${row}`).value = marca;

        this.logger.log(`    ✅ Positivo (Si/Bueno) en fila ${row}`);
      }
      // GRUPO NEGATIVO (Malo / No)
      else if (['malo', 'no', 'false', '0'].includes(valor)) {
        // Si existe columna 'malo', marcamos
        if (columns.malo)
          worksheet.getCell(`${columns.malo}${row}`).value = marca;
        // Si existe columna 'no', marcamos (ESTO FALTABA)
        if (columns.no) worksheet.getCell(`${columns.no}${row}`).value = marca;

        this.logger.log(`    ✅ Negativo (No/Malo) en fila ${row}`);
      }
      // GRUPO N/A (No Aplica) - (TODO ESTO FALTABA)
      else if (['na', 'n/a', 'no aplica'].includes(valor)) {
        if (columns.na) {
          worksheet.getCell(`${columns.na}${row}`).value = marca;
          this.logger.log(`    ✅ N/A en ${columns.na}${row}`);
        }
      } else {
        this.logger.warn(`    ⚠️ Valor no reconocido: "${valor}"`);
      }
    }

    // Agregar observaciones
    if (response.observacion?.trim() && columns.observaciones) {
      const etiqueta = sectionConfig.name || 'Obs';

      this.escribirObservacionConPrefijo(
        worksheet,
        columns.observaciones,
        row,
        response.observacion,
        etiqueta,
      );

      this.logger.log(
        `    📝 Observación agregada en ${columns.observaciones}${row} (${etiqueta})`,
      );
    }
  }

  /**
   * Procesa secciones de tipo "boolean" (bueno/malo)
   */

  /**
   * Convierte letra de columna Excel a número (A=1, B=2, ..., Z=26, AA=27, etc.)
   */
  private getExcelColumnNumber(colRef: string): number {
    let num = 0;
    for (let i = 0; i < colRef.length; i++) {
      num = num * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return num;
  }

  /**
   * Convierte número a letra de columna Excel (1=A, 2=B, ..., 26=Z, 27=AA, etc.)
   */
  private getExcelColumnLetter(colNum: number): string {
    let letters = '';
    while (colNum > 0) {
      colNum--;
      letters = String.fromCharCode((colNum % 26) + 65) + letters;
      colNum = Math.floor(colNum / 26);
    }
    return letters;
  }

  /**
   * Procesa secciones donde la respuesta se escribe EN LA MISMA CELDA del texto
   * Modos soportados:
   * - 'append': Concatena texto existente + respuesta (ej: "Texto: N/A")
   * - 'replace': Reemplaza completamente el texto con la respuesta
   * - 'prefix': Prefija la respuesta antes del texto (ej: "N/A - Texto")
   */
  private procesarSeccionInlineResponse(
    worksheet: ExcelJS.Worksheet,
    sectionConfig: any,
    row: number,
    response: any,
  ) {
    const { columns, options = {} } = sectionConfig;
    const cellRef = `${columns.target}${row}`;
    const cell = worksheet.getCell(cellRef);

    // Leer texto existente
    const textoExistente = cell.value?.toString()?.trim() || '';
    this.logger.log(`  📝 Fila ${row} - Texto original: "${textoExistente}"`);

    // Obtener respuesta (con valor por defecto)
    let respuesta =
      response.value !== undefined && response.value !== null
        ? String(response.value).trim()
        : options.defaultValue || 'N/A';

    // Normalizar "N/A" y variantes
    if (respuesta.toLowerCase().includes('n/a')) {
      respuesta = 'N/A';
    }

    let nuevoValor: string;

    // Aplicar modo según configuración
    switch (options.mode || 'append') {
      case 'replace':
        nuevoValor = respuesta;
        this.logger.log(`    ➡️ Reemplazando con: "${respuesta}"`);
        break;

      case 'prefix':
        nuevoValor = `${respuesta}${options.separator || ' - '}${textoExistente}`;
        this.logger.log(`    ➡️ Prefijando: "${nuevoValor}"`);
        break;

      case 'append':
      default:
        // Si hay texto existente, concatenar; si no, solo respuesta
        nuevoValor = textoExistente
          ? `${textoExistente}${options.separator || ': '}${respuesta}`
          : respuesta;
        this.logger.log(`    ➡️ Concatenando: "${nuevoValor}"`);
        break;
    }

    // Escribir nuevo valor
    cell.value = nuevoValor;

    // ✅ Mantener formato existente (negrita, fuente, etc.)
    if (textoExistente) {
      cell.font = { ...cell.font };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      };
    }

    // Agregar observación en celda adyacente si existe
    if (response.observacion?.trim()) {
      const obsColNum = this.getExcelColumnNumber(columns.target) + 1;
      const obsColLetter = this.getExcelColumnLetter(obsColNum);
      const obsCell = worksheet.getCell(`${obsColLetter}${row}`);
      obsCell.value = response.observacion;
      obsCell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      };
      this.logger.log(
        `    📝 Observación en ${obsColLetter}${row}: "${response.observacion}"`,
      );
    }

    this.logger.log(`    ✅ Resultado en ${cellRef}: "${nuevoValor}"`);
  }
  /**
   * Llena el diagrama de daños del vehículo
   */

  /**
   * Llena las observaciones generales
   */
//   private async llenarObservacionesGenerales(
//     worksheet: ExcelJS.Worksheet,
//     inspection: InspectionHerraEquipos,
//   ) {
//     try {
//       if (
//         inspection.generalObservations &&
//         inspection.generalObservations.trim() !== ''
//       ) {
//         // ⚠️ AJUSTAR POSICIÓN SEGÚN TU TEMPLATE
//         worksheet.getCell('A54').value = inspection.generalObservations;
//         this.logger.log('Observaciones generales completadas');
//       }
//     } catch (error) {
//       this.logger.error(
//         `Error al llenar observaciones generales: ${error.message}`,
//       );
//       throw error;
//     }
//   }

  /**
   * Llena las firmas del inspector y supervisor
   */
 private async llenarFirmas(
    sheets: ExcelJS.Worksheet[],
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log(`Iniciando llenado de firmas en ${sheets.length} hojas...`);

      // 1. TU CONFIGURACIÓN EXACTA (NO SE TOCA)
      const posiciones = {
        inspector: {
          nombre: 'D40', // Corregí D4O a D40 (parecía un error tipográfico O -> 0)
          firma: 'G40', 
          fecha: 'G40',
          cargo: 'A70',
        },
        supervisor: {
          nombre: 'Q40',
          firma: 'Z40', 
          fecha: 'Z40',
          cargo: 'I70',
        },
      };

      // 2. ITERAMOS HOJAS
      for (const currentSheet of sheets) {
        
        // =========================================================
        // INSPECTOR
        // El objeto 'inspectorSignature' trae todo: nombre, firma (img) y fecha
        // =========================================================
        const inspData = inspection.inspectorSignature; // Este es el OBJETO del JSON

        if (inspData) {
          // A) FECHA (Texto en G40)
          if (inspData.inspectionDate) {
            const cell = currentSheet.getCell(posiciones.inspector.fecha);
            cell.value = inspData.inspectionDate; // "2026-02-18"
            
            // Estilo: Pegado al fondo para que no lo tape la firma
            cell.alignment = { vertical: 'bottom', horizontal: 'center' };
            cell.font = { name: 'Arial', size: 8 };
          }

          // B) FIRMA (Imagen en G40)
          if (
            inspData.inspectorSignature && 
            typeof inspData.inspectorSignature === 'string' &&
            inspData.inspectorSignature.startsWith('data:image/')
          ) {
            await this.insertarImagen(
              currentSheet,
              inspData.inspectorSignature, // El string base64
              posiciones.inspector.firma,  // 'G40'
              0.75 // Altura 75% (Dejar espacio abajo para la fecha)
            );
          }
          if (inspData.inspectorName) {
            const cell = currentSheet.getCell(posiciones.inspector.nombre);
            cell.value = inspData.inspectorName;
          }
        }

        // =========================================================
        // SUPERVISOR
        // El objeto 'supervisorSignature' trae todo
        // =========================================================
        const supData = inspection.supervisorSignature; // Este es el OBJETO del JSON

        if (supData) {
          // A) FECHA (Texto en Z40)
          if (supData.supervisorDate) {
            const cell = currentSheet.getCell(posiciones.supervisor.fecha);
            cell.value = supData.supervisorDate; // "2026-02-18"
            
            cell.alignment = { vertical: 'bottom', horizontal: 'center' };
            cell.font = { name: 'Arial', size: 8 };
          }

          // B) FIRMA (Imagen en Z40)
          if (
            supData.supervisorSignature &&
            typeof supData.supervisorSignature === 'string' &&
            supData.supervisorSignature.startsWith('data:image/')
          ) {
            await this.insertarImagen(
              currentSheet,
              supData.supervisorSignature, // El string base64
              posiciones.supervisor.firma, // 'Z40'
              0.75 // Altura 75%
            );
          }

          if (supData.supervisorName) {
            const cell = currentSheet.getCell(posiciones.supervisor.nombre);
            cell.value = supData.supervisorName;
          }
        }
      }

      this.logger.log('✅ Firmas completadas sin alterar lógica');
    } catch (error) {
      this.logger.error(`Error al llenar firmas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca SI/NO y escribe el CÓDIGO dentro de una misma celda de texto.
   * Funciona buscando patrones de texto (Regex) y reemplazándolos.
   */
  /**
   * Llena la sección de Estado Operativo (SI/NO/COD) en una misma celda.
   */
  /**
   * Llena el Estado Operativo manejando múltiples hojas y posiciones dispersas.
   */
  private async llenarEstadoOperativo(
    sheets: ExcelJS.Worksheet[],
    inspection: InspectionHerraEquipos,
  ) {
    try {
      this.logger.log('Iniciando llenado de Estado Operativo (Columnas separadas + Multi-hoja)...');

      // 1. DATA
      const data = inspection.outOfService as any;
      if (!data) return;

      // 2. IDENTIFICAR HOJAS
      const sheetAnverso = sheets.find((s) => s.name === 'ANVERSO') || sheets[0];
      const sheetReverso = sheets.find((s) => s.name === 'REVERSO') || sheets[1];
        const CHECKED = 'SI ☑';  // Casilla marcada
      const UNCHECKED = 'NO ☐'; // Casilla vacía
      // 3. CONFIGURACIÓN MAESTRA
      // Ahora definimos celdaSi y celdaNo por separado
      const configuracion = {
        arnes: {
          hoja: sheetAnverso,
          celdaSi: 'X36',      // 👈 Columna del SI
          celdaNo: 'Y36',      // 👈 Columna del NO
          celdaCodigo: 'Z36',  // 👈 Columna del Código
          valorStatus: data.statusArnes,
          valorCodigo: data.codArnes,
        },
        autoRetractil: {
          hoja: sheetAnverso,
          celdaSi: 'X37',
          celdaNo: 'Y37',
          celdaCodigo: 'Z37',
          valorStatus: data.statusAutoRetractil,
          valorCodigo: data.codAutoRetractil,
        },
        // Para el reverso, ajusta las celdas a donde correspondan los checks
        conectorAnclaje: {
          hoja: sheetReverso,
          celdaSi: 'X36',       // ⚠️ Ajusta a la celda real del SI en reverso
          celdaNo: 'Y36',       // ⚠️ Ajusta a la celda real del NO en reverso
          celdaCodigo: 'Z36',
          valorStatus: data.statusConectorAnclaje,
          valorCodigo: data.codConectorAnclaje,
        },
        conector: {
          hoja: sheetReverso,
          celdaSi: 'X37',       // ⚠️ Ajusta celda SI
          celdaNo: 'Y37',       // ⚠️ Ajusta celda NO
          celdaCodigo: 'Z37',   
          valorStatus: data.statusConector,
          valorCodigo: data.codConector,
        },
      };

      // 4. PROCESAMIENTO
      for (const key in configuracion) {
        const item = configuracion[key];
        const hoja = item.hoja;

        if (!hoja) continue;

        // --- PASO A: MARCAR CON "X" (SI / NO) ---
        if (item.celdaSi && item.celdaNo) {
          const cellSi = hoja.getCell(item.celdaSi);
          const cellNo = hoja.getCell(item.celdaNo);

          // Lógica: "Si es SI, marca SI y desmarca NO. Si es NO, marca NO y desmarca SI"
          if (item.valorStatus === 'yes') {
            cellSi.value = CHECKED;   // ☑
            cellNo.value = UNCHECKED; // ☐
          } else if (item.valorStatus === 'no') {
            cellSi.value = UNCHECKED; // ☐
            cellNo.value = CHECKED;   // ☑
          } else {
            // Si no hay respuesta, ambas vacías
            cellSi.value = UNCHECKED;
            cellNo.value = UNCHECKED;
          }

          // Centrado para que se vea bien la casilla
          cellSi.alignment = { horizontal: 'center', vertical: 'middle' };
          cellNo.alignment = { horizontal: 'center', vertical: 'middle' };
          
          // Opcional: Aumentar un poco la fuente si el símbolo se ve muy chico
          // cellSi.font = { size: 12 };
          // cellNo.font = { size: 12 };
        }

        // --- PASO B: ESCRIBIR CÓDIGO ---
        if (item.celdaCodigo && item.valorCodigo) {
          const cell = hoja.getCell(item.celdaCodigo);
          
          // Escribimos el código directamente. 
          // Si quieres mantener el formato "COD.: ..." puedes concatenar
          cell.value = `COD.: ${item.valorCodigo}`;
          
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      }

      this.logger.log('✅ Estado Operativo completado (Checks X/Y)');
    } catch (error) {
      this.logger.error(`Error llenando estado operativo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🛠️ FUNCIÓN MEJORADA: Manipula el texto dentro de una celda
   * Busca "SI", "NO" y "COD.:" y los actualiza visualmente.
   */
  private async marcarYCodificarEnCelda(
    worksheet: ExcelJS.Worksheet,
    cellRef: string,
    esSi: boolean,
    esNo: boolean,
    codigo: string = '',
  ) {
    const cell = worksheet.getCell(cellRef);
    let text = cell.value ? String(cell.value) : '';

    if (!text) return; // Si la celda está vacía, no hacemos nada

    // SÍMBOLOS
    const CHECK = '☑'; // O puedes usar '(X)'
    const UNCHECK = '☐'; // O puedes usar '( )' o '☐'

    // 1. MARCAR "SI"
    // Busca la palabra "SI" seguida opcionalmente de un cuadro ☐
    if (esSi) {
      // Reemplaza "SI ☐" por "SI ☑" o simplemente agrega la marca al lado de SI
      // La Regex busca la palabra SI (borde de palabra) y opcionalmente un cuadro
      text = text.replace(/\bSI\s*[☐\[\(]?\s*[\]\)]?/g, `SI ${CHECK}`);
    } else {
      // Asegurarse de limpiar marcas previas si existen (reset)
      text = text.replace(/\bSI\s*☑/g, `SI ${UNCHECK}`);
    }

    // 2. MARCAR "NO"
    if (esNo) {
      text = text.replace(/\bNO\s*[☐\[\(]?\s*[\]\)]?/g, `NO ${CHECK}`);
    } else {
      text = text.replace(/\bNO\s*☑/g, `NO ${UNCHECK}`);
    }

    // 3. INSERTAR CÓDIGO
    // Busca "COD.:" seguido de puntos, espacios o nada, y coloca el código
    if (codigo) {
      // Regex: Busca "COD.:" o "COD:" ignorando mayúsculas, seguido de cualquier cosa hasta el final o puntos
      // Reemplaza los puntos suspensivos "......" con el código real
      text = text.replace(/(COD\.?[:\s]*)([\._]*)/i, `$1 ${codigo}`);
    }

    // 4. GUARDAR Y DAR FORMATO
    cell.value = text;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  }

  /**
   * Genera el archivo Excel completo para inspección de vehículos
   */
  async generateExcel(inspection: InspectionHerraEquipos): Promise<Buffer> {
    try {
      this.logger.log(`Generando Excel (Anverso y Reverso)...`);

      // 1. Cargar Template
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath);
      

      // 2. Identificar las hojas
      // Intenta buscarlas por nombre exacto, si no, usa índices (0 = Anverso, 1 = Reverso)
      const sheetAnverso =
        workbook.getWorksheet('ANVERSO') || workbook.worksheets[0];
      const sheetReverso =
        workbook.getWorksheet('REVERSO') || workbook.worksheets[1];
const sheets = [sheetAnverso, sheetReverso];
      if (!sheetAnverso || !sheetReverso) {
        throw new Error(
          'No se encontraron las hojas ANVERSO y REVERSO en el template.',
        );
      }

      this.logger.log(
        `Hojas encontradas: ${sheetAnverso.name}, ${sheetReverso.name}`,
      );

      // 3. Llenar datos (Pasamos las hojas específicas según corresponda)

      // Datos generales suelen ir en el Anverso
      await this.llenarCamposVerificacion(sheetAnverso, inspection);
      await this.llenarDatosArnes(sheetAnverso, inspection);

      // Respuestas pueden ir en AMBAS hojas (pasamos el workbook o ambas hojas)
      await this.llenarRespuestas(workbook, inspection);
await this.llenarEstadoOperativo(sheets, inspection);
      // Observaciones y Firmas suelen ir al final (Reverso)
      //await this.llenarObservacionesGenerales(sheetReverso, inspection);
      await this.llenarFirmas([sheetAnverso, sheetReverso], inspection);

      // 4. Generar Buffer
      const excelBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(excelBuffer);
    } catch (error) {
      this.logger.error(`Error generando Excel: ${error.message}`);
      throw error;
    }
  }
}
