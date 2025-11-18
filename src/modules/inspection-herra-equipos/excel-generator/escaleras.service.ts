import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';

@Injectable()
export class ExcelEscaleraService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelEscaleraService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'Escaleras.xlsx');
  }

  /**
   * Códigos de template soportados: 1.02.P06.F37
   */
  getSupportedTemplateCodes(): string[] {
    return ['1.02.P06.F33'];
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

      worksheet.getCell('B5').value = valores[0] || ''; // EMPRESA
      worksheet.getCell('B6').value = valores[1] || ''; // FECHA
      worksheet.getCell('E5').value = valores[2] || ''; // Superintendecia
      worksheet.getCell('E6').value = valores[3] || ''; // codigo 
      worksheet.getCell('K5').value = valores[4] || ''; // AREA
      worksheet.getCell('K6').value = valores[5] || ''; // tipo de escalera

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

private async marcarCasillasSeleccionadas(
  worksheet: ExcelJS.Worksheet,
  selectedItems: Record<string, string[]>
) {
  try {
    this.logger.log('🔲 Marcando casillas de items seleccionados');

    // Mapeo de keyword a celda específica
    const cellMapping: Record<string, string> = {
      'ESCALERA SIMPLE': 'A24',
      'SIMPLE DE UN TRAMO': 'A24',
      'ESCALERA DOBLE': 'A26',
      'TIJERA': 'A26',
      'EXTENSIBLE': 'A31',
      'TELESCÓPICA': 'A31',
      'PLATAFORMA MOVIBLE': 'A35',
    };

    const CASILLA_MARCADA = '☑';
    const CASILLA_VACIA = '☐';

    // Crear set de celdas que deben marcarse como seleccionadas
    const celdasSeleccionadas = new Set<string>();

    // Identificar qué celdas fueron seleccionadas
    for (const [key, selections] of Object.entries(selectedItems)) {
      if (!Array.isArray(selections)) continue;

      selections.forEach((selectedOption) => {
        for (const [keyword, cellRef] of Object.entries(cellMapping)) {
          if (selectedOption.toUpperCase().includes(keyword)) {
            celdasSeleccionadas.add(cellRef);
            break;
          }
        }
      });
    }

    this.logger.log(`Celdas seleccionadas: ${Array.from(celdasSeleccionadas).join(', ')}`);

    // Marcar TODAS las celdas (seleccionadas y no seleccionadas)
    const todasLasCeldas = new Set(Object.values(cellMapping));
    
    todasLasCeldas.forEach((cellRef) => {
      const cell = worksheet.getCell(cellRef);
      const textoOriginal = cell.value ? String(cell.value) : '';
      const estaMarcada = celdasSeleccionadas.has(cellRef);
      const marca = estaMarcada ? CASILLA_MARCADA : CASILLA_VACIA;
      
      // Concatenar texto original + casilla
      cell.value = `${textoOriginal} ${marca}`.trim();
      
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left'
      };

      this.logger.log(`${estaMarcada ? '✅' : '☐'} ${cellRef}: "${cell.value}"`);
    });

    this.logger.log('✅ Casillas marcadas completadas');
  } catch (error) {
    this.logger.error(`❌ Error al marcar casillas: ${error.message}`);
    throw error;
  }
}

  /**
   * Llena las respuestas de las preguntas de inspección
   */
/**
 * Llena las respuestas de las preguntas de inspección
 * Maneja tanto secciones principales como subsecciones anidadas
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

    // Configuración de secciones principales
    const mainSections = [
      { id: 'section_0', startRow: 10, endRow: 22, name: 'VERIFICACIÓN GENERAL' },
      { id: 'section_1', startRow: 24, endRow: 40, name: 'OTRAS CONSIDERACIONES', skipProcessing: true }, // Solo contiene subsecciones
      { id: 'section_2', startRow: 42, endRow: 44, name: 'VERIFICACIÓN DEL ALMACENAMIENTO' },
    ];

    // Configuración de subsecciones dinámicas (ajusta los rangos según tu Excel)
    const subsectionMapping = {
      'SIMPLE DE UN TRAMO': { startRow: 25, endRow: 25, name: 'ESCALERA SIMPLE DE UN TRAMO' },
      'ESCALERA SIMPLE': { startRow: 25, endRow: 25, name: 'ESCALERA SIMPLE DE UN TRAMO' },
      'DOBLE O DE TIJERA': { startRow: 27, endRow: 30, name: 'ESCALERA DOBLE O DE TIJERA' },
      'ESCALERA DOBLE': { startRow: 27, endRow: 30, name: 'ESCALERA DOBLE O DE TIJERA' },
      'TIJERA': { startRow: 27, endRow: 30, name: 'ESCALERA DOBLE O DE TIJERA' },
      'EXTENSIBLE': { startRow: 32, endRow: 34, name: 'ESCALERA EXTENSIBLE O TELESCÓPICA' },
      'TELESCÓPICA': { startRow: 32, endRow: 34, name: 'ESCALERA EXTENSIBLE O TELESCÓPICA' },
      'PLATAFORMA MOVIBLE': { startRow: 36, endRow: 40, name: 'ESCALERA TIPO PLATAFORMA MOVIBLE' },
    };

    // Columnas fijas
    const columns = {
      si: 'G',
      no: 'H',
      na: 'I',
      observaciones: 'J'
    };

    // Obtener items seleccionados
    const selectedItems = inspection.selectedItems || {};
    this.logger.log('Items seleccionados:', JSON.stringify(selectedItems, null, 2));

    // Marcar casillas de subsecciones
    

    // Procesar cada entrada en responses
    Object.entries(inspection.responses).forEach(([sectionId, sectionResponses]) => {
      
      // Verificar si contiene subsecciones anidadas
      const hasSubsections = this.tieneSubseccionesAnidadas(sectionResponses);

      if (hasSubsections) {
        this.logger.log(`📦 Sección ${sectionId} contiene subsecciones anidadas`);
        
        // Procesar cada subsección
        Object.entries(sectionResponses as Record<string, any>).forEach(([subId, subResponses]) => {
          if (subId.startsWith('sub')) {
            this.procesarSubseccion(
              worksheet, 
              subId, 
              subResponses, 
              selectedItems, 
              subsectionMapping, 
              columns
            );
          }
        });
        return;
      }
      
      // Buscar configuración de sección principal
      const sectionConfig = mainSections.find(s => s.id === sectionId);
      
      if (!sectionConfig) {
        this.logger.warn(`⚠️ No se pudo mapear la sección: ${sectionId}`);
        return;
      }

      // Procesar sección principal
      this.procesarSeccion(worksheet, sectionConfig, sectionResponses, columns);
    });

    await this.marcarCasillasSeleccionadas(worksheet, selectedItems);

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
 * Procesa una subsección individual
 */
private procesarSubseccion(
  worksheet: ExcelJS.Worksheet,
  subId: string,
  subResponses: any,
  selectedItems: Record<string, string[]>,
  subsectionMapping: Record<string, any>,
  columns: { si: string; no: string; na: string; observaciones: string }
) {
  const subIndex = parseInt(subId.replace('sub', ''));
  
  this.logger.log(`🔍 Procesando subsección: ${subId} (índice ${subIndex})`);
  
  // Buscar configuración basada en selectedItems
  let sectionConfig: any = undefined;
  
  for (const [key, selections] of Object.entries(selectedItems)) {
    if (!Array.isArray(selections) || selections.length === 0) continue;
    
    this.logger.log(`  📋 Analizando grupo: "${key.substring(0, 50)}..."`);
    this.logger.log(`  📋 Selecciones disponibles: ${selections.length}`);
    
    if (subIndex < selections.length) {
      const selectedOption = selections[subIndex];
      this.logger.log(`  ✅ ${subId} corresponde a: "${selectedOption}"`);
      
      // Buscar match con keywords
      for (const [keyword, config] of Object.entries(subsectionMapping)) {
        if (selectedOption.toUpperCase().includes(keyword.toUpperCase())) {
          sectionConfig = config;
          this.logger.log(`  ✅ MATCH encontrado con keyword: "${keyword}"`);
          this.logger.log(`  ✅ Mapeado a: ${config.name} (filas ${config.startRow}-${config.endRow})`);
          break;
        }
      }
      
      if (sectionConfig) break;
    } else {
      this.logger.warn(`  ⚠️ No hay selección en índice ${subIndex}`);
    }
  }
  
  if (!sectionConfig) {
    this.logger.error(`  ❌ NO se encontró mapeo para ${subId}`);
    return;
  }

  // Procesar preguntas de la subsección
  this.procesarSeccion(worksheet, sectionConfig, subResponses, columns);
}

/**
 * Procesa una sección o subsección y llena sus respuestas
 */
private procesarSeccion(
  worksheet: ExcelJS.Worksheet,
  sectionConfig: any,
  sectionResponses: any,
  columns: { si: string; no: string; na: string; observaciones: string }
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
      worksheet.getCell(`${columns.si}${currentRow}`).value = '';
      worksheet.getCell(`${columns.no}${currentRow}`).value = '';
      worksheet.getCell(`${columns.na}${currentRow}`).value = '';

      // Marcar respuesta
      if (response.value !== undefined && response.value !== null) {
        const valor = String(response.value).toLowerCase().trim();
        
        if (valor === 'bueno' || valor === 'si' || valor === 'true' || valor === '1') {
          worksheet.getCell(`${columns.si}${currentRow}`).value = 'X';
          this.logger.log(`    ✅ SI en ${columns.si}${currentRow}`);
        } else if (valor === 'malo' || valor === 'no' || valor === 'false' || valor === '0') {
          worksheet.getCell(`${columns.no}${currentRow}`).value = 'X';
          this.logger.log(`    ✅ NO en ${columns.no}${currentRow}`);
        } else if (valor === 'na' || valor === 'n/a') {
          worksheet.getCell(`${columns.na}${currentRow}`).value = 'X';
          this.logger.log(`    ✅ NA en ${columns.na}${currentRow}`);
        } else {
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
        worksheet.getCell('A48').value = inspection.generalObservations;
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
        nombre: 'M47',
        firma: 'M49',
        fecha: 'B85', 
        cargo: 'A70'
      },
      supervisor: {
        nombre: 'M51',
        firma: 'M53',
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
      await this.llenarObservacionesGenerales(worksheet, inspection);
      await this.llenarFirmas(worksheet, inspection);
      

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
