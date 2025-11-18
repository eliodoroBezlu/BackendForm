import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';

@Injectable()
export class ExcelGruaCabinaService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelGruaCabinaService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'GruaCabina.xlsx');
  }

  /**
   * Códigos de template soportados: 3.04.P04.F35
   */
  getSupportedTemplateCodes(): string[] {
    return ['3.04.P04.F23'];
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
    this.logger.log('Iniciando llenado de campos de verificación');

    if (!inspection.verification) {
      this.logger.warn('No se encontraron datos de verificación');
      return;
    }

    const valores = Array.from(Object.values(inspection.verification));

    const cellMapping = [
      { cell: 'A6', value: valores[0], label: 'operador' },
      { cell: 'A7', value: valores[1], label: 'Tag del puente grua ' },
      { cell: 'D6', value: valores[2], label: 'fecha' },
      { cell: 'D7', value: valores[3], label: 'turno' },
      { cell: 'G6', value: valores[4], label: 'hora' },
    ];

    // 🔥 RECUPERAR valor actual de cada celda y concatenar
    cellMapping.forEach(({ cell, value, label }) => {
      if (!value) return;
      
      const cellObj = worksheet.getCell(cell);
      
      // 1. RECUPERAR el valor actual de la celda
      const valorActual = cellObj.value ? String(cellObj.value) : '';
      
      // 2. CONCATENAR con el nuevo valor
      const valorConcatenado = valorActual ? `${valorActual} ${value}` : value;
      
      // 3. ASIGNAR el nuevo valor concatenado
      cellObj.value = valorConcatenado;
      
      this.logger.log(`✅ ${label} (${cell}): "${valorActual}" + "${value}" = "${valorConcatenado}"`);
    });

    this.logger.log('Campos de verificación completados exitosamente');
  } catch (error) {
    this.logger.error(`Error al llenar campos de verificación: ${error.message}`);
    throw error;
  }
}


  /**
   * Llena los datos específicos del vehículo (tipo inspección, certificación, etc.)
   */

 





  /**
   * Llena las respuestas de las preguntas de inspección
   */
  /**
 * Llena las respuestas de las preguntas de inspección
 * VERSIÓN PARA GRÚA: Subsecciones fijas sin selectedItems
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

    // Configuración de secciones y subsecciones FIJAS
    const sectionConfig = {
      // Sección 0 y sus subsecciones
      'section_0': { startRow: 12, endRow: 26, name: 'Mandos de Control  dentro la cabina' }, 
      // Sección 1 y sus subsecciones
      'section_1': { startRow: 28, endRow: 29, name: 'Interruptores de fin de carrera del gancho'},
      // Otras secciones si las hay
      'section_2': { startRow: 31, endRow: 33, name: 'Gancho' },
      'section_3': { startRow: 35, endRow: 38, name: 'Cable' },
      'section_4': { startRow: 40, endRow: 43, name: 'Yugo' },
      'section_5': { startRow: 45, endRow: 47, name: 'Eléctrico' },
      'section_6': { startRow: 49, endRow: 65, name: 'Aspectos Generales' },

    };

    // Columnas fijas
    const columns = {
      bueno: 'D',
      malo: 'E',
      observaciones: 'F'
    };

    // Procesar cada entrada en responses
    Object.entries(inspection.responses).forEach(([sectionId, sectionResponses]) => {
      
      // Verificar si contiene subsecciones anidadas
      const hasSubsections = this.tieneSubseccionesAnidadas(sectionResponses);

      if (hasSubsections) {
        this.logger.log(`📦 Sección ${sectionId} contiene subsecciones anidadas`);
        
        // Procesar cada subsección con mapeo fijo
        Object.entries(sectionResponses as Record<string, any>).forEach(([subId, subResponses]) => {
          if (subId.startsWith('sub')) {
            // Construir el ID completo para buscar en el config
            const fullSubId = `${sectionId}_${subId}`;
            const config = sectionConfig[fullSubId];
            
            if (config) {
              this.logger.log(`🔍 Procesando subsección: ${fullSubId}`);
              this.procesarSeccion(worksheet, config, subResponses, columns);
            } else {
              this.logger.warn(`⚠️ No se encontró configuración para: ${fullSubId}`);
            }
          }
        });
        return;
      }
      
      // Procesar sección normal (sin subsecciones)
      const config = sectionConfig[sectionId];
      
      if (!config) {
        this.logger.warn(`⚠️ No se encontró configuración para: ${sectionId}`);
        return;
      }

      if (config.hasSubsections) {
        this.logger.log(`⏭️ Saltando ${sectionId} (solo contiene subsecciones)`);
        return;
      }

      this.procesarSeccion(worksheet, config, sectionResponses, columns);
    });

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
  return sectionResponses && 
    typeof sectionResponses === 'object' && 
    Object.keys(sectionResponses).some(key => key.startsWith('sub'));
}

/**
 * Procesa una sección o subsección y llena sus respuestas
 */
private procesarSeccion(
  worksheet: ExcelJS.Worksheet,
  sectionConfig: any,
  sectionResponses: any,
  columns: { bueno: string; malo: string; observaciones: string }
) {
  this.logger.log(`📋 Procesando: ${sectionConfig.name} (filas ${sectionConfig.startRow}-${sectionConfig.endRow})`);
  
  const numQuestions = Object.keys(sectionResponses).length;
  this.logger.log(`  📊 Número de preguntas: ${numQuestions}`);
  
  let currentRow = sectionConfig.startRow;

  Object.entries(sectionResponses as Record<string, any>).forEach(([questionId, response], index) => {
    if (currentRow > sectionConfig.endRow) {
      this.logger.warn(`  ⚠️ Límite de filas excedido en ${sectionConfig.name}`);
      return;
    }

    try {
      this.logger.log(`  📝 Fila ${currentRow} - ${questionId}: "${response.value}"`);
      
      // Limpiar celdas
      worksheet.getCell(`${columns.bueno}${currentRow}`).value = '';
      worksheet.getCell(`${columns.malo}${currentRow}`).value = '';

      // Marcar respuesta
      if (response.value !== undefined && response.value !== null) {
        const valor = String(response.value).toLowerCase().trim();
        
        if (valor === 'bueno' || valor === 'si' || valor === 'true' || valor === '1' || valor === 'bien') {
          worksheet.getCell(`${columns.bueno}${currentRow}`).value = 'X';
          this.logger.log(`    ✅ SI en ${columns.bueno}${currentRow}`);
        } else if (valor === 'malo' || valor === 'no' || valor === 'false' || valor === '0' || valor === 'mal') {
          worksheet.getCell(`${columns.malo}${currentRow}`).value = 'X';
          this.logger.log(`    ✅ NO en ${columns.malo}${currentRow}`);
        } 
         else {
          this.logger.warn(`    ⚠️ Valor no reconocido: "${valor}"`);
        }
      }

      // Agregar observaciones
      if (response.observacion?.trim()) {
        worksheet.getCell(`${columns.observaciones}${currentRow}`).value = response.observacion;
        this.logger.log(`    📝 Observación agregada`);
      }

      currentRow++;
    } catch (error) {
      this.logger.error(`  ❌ Error en fila ${currentRow}: ${error.message}`);
      currentRow++;
    }
  });
}
  /**
   * Llena el diagrama de daños del vehículo
   */
 

  /**
   * Llena las observaciones generales
   */
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
          worksheet.getCell('A67').value = inspection.generalObservations;
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
        nombre: 'B73',
        firma: 'B71',
        fecha: 'B85', 
        cargo: 'A70'
      },
      supervisor: {
        nombre: 'E73',
        firma: 'E71',
        fecha: 'J85',
        cargo: 'I70'
      }
    };

    // INSPECTOR
    if (inspection.inspectorSignature) {
      const insp = inspection.inspectorSignature;
      
      if (insp.inspectorName) worksheet.getCell(posiciones.inspector.nombre).value = insp.inspectorName;
      
      if (insp.inspectorSignature && typeof insp.inspectorSignature === 'string' && insp.inspectorSignature.startsWith('data:image/')) {
        await this.insertarImagen(worksheet, insp.inspectorSignature, posiciones.inspector.firma);
      }
      
//if (insp.inspectionDate) worksheet.getCell(posiciones.inspector.fecha).value = insp.inspectionDate;
     // if (insp.cargo) worksheet.getCell(posiciones.inspector.cargo).value = insp.cargo;
    }

    // SUPERVISOR
    if (inspection.supervisorSignature) {
      const sup = inspection.supervisorSignature;
      
      if (sup.supervisorName) worksheet.getCell(posiciones.supervisor.nombre).value = sup.supervisorName;
      
      if (sup.supervisorSignature && typeof sup.supervisorSignature === 'string' && sup.supervisorSignature.startsWith('data:image/')) {
        await this.insertarImagen(worksheet, sup.supervisorSignature, posiciones.supervisor.firma);
      }
      
    //  if (sup.supervisorDate) worksheet.getCell(posiciones.supervisor.fecha).value = sup.supervisorDate;
    //  if (sup.cargo) worksheet.getCell(posiciones.supervisor.cargo).value = sup.cargo;
    }

    // Ajustar altura de filas para las imágenes de firma
    //worksheet.getRow(69).height = 40;

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
