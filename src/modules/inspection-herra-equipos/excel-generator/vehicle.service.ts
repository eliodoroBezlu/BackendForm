import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';

@Injectable()
export class ExcelVehicleService {
  private readonly templatePath: string;
  private readonly logger = new Logger(ExcelVehicleService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('VEHICLE_EXCEL_TEMPLATE_PATH') ||
      path.join(process.cwd(), 'src', 'templates', 'vehicle.xlsx');
  }

  /**
   * Códigos de template soportados: 3.04.P48.F03
   */
  getSupportedTemplateCodes(): string[] {
    return ['3.04.P48.F03'];
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
      return codeMatch && revision === '6';
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

      worksheet.getCell('B6').value = valores[0] || ''; // EMPRESA
      worksheet.getCell('B7').value = valores[1] || ''; // CONDUCTOR
      worksheet.getCell('B8').value = valores[2] || ''; // TIPO DE VEHICULO
      worksheet.getCell('B9').value = valores[3] || ''; // NUMERO INTERNO
      worksheet.getCell('F6').value = valores[4] || ''; // COLOR
      worksheet.getCell('F8').value = valores[5] || ''; // PLACA
      worksheet.getCell('F9').value = valores[6] || ''; // AÑO VEHÍCULO/EQUIPO
      worksheet.getCell('J6').value = valores[7] || ''; // FECHA
      worksheet.getCell('J7').value = valores[8] || ''; //LICENCIA
      worksheet.getCell('J8').value = valores[9] || ''; // LICENCIA CATEGORÍA AÑO
      worksheet.getCell('J9').value = valores[10] || ''; // RECORRIDO

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
  marcado: boolean
) {
  const CASILLA_MARCADA = '☒';
  const CASILLA_VACIA = '☐';
  
  const cell = worksheet.getCell(cellRef);
  cell.value = marcado ? CASILLA_MARCADA : CASILLA_VACIA;
  
  // Aplicar formato centrado
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center'
  };
}

  /**
   * Llena los datos específicos del vehículo (tipo inspección, certificación, etc.)
   */
  private async llenarDatosVehiculo(
  worksheet: ExcelJS.Worksheet,
  inspection: InspectionHerraEquipos,
) {
  try {
    if (!inspection.vehicle) {
      this.logger.warn('No se encontraron datos específicos del vehículo');
      return;
    }

    this.logger.log('Iniciando llenado de datos específicos del vehículo');

    // Tipo de inspección
    if (inspection.vehicle.tipoInspeccion) {
      const tipoInspeccion = inspection.vehicle.tipoInspeccion.toLowerCase();
      
      await this.marcarCasilla(worksheet, 'D4', tipoInspeccion.includes('inicial'));
      await this.marcarCasilla(worksheet, 'F4', tipoInspeccion.includes('periódica') || tipoInspeccion.includes('periodica'));
    }

    // Certificación MSC
    if (inspection.vehicle.certificacionMSC) {
      const certificacion = inspection.vehicle.certificacionMSC.toLowerCase();
      
      const siCertificado = certificacion.includes('si') || certificacion.includes('sí') || certificacion === 'true';
      const noCertificado = certificacion.includes('no') || certificacion === 'false';
      
      await this.marcarCasilla(worksheet, 'K4', siCertificado);
      await this.marcarCasilla(worksheet, 'M4', noCertificado);
    }

    // Fecha próxima inspección
    if (inspection.vehicle.fechaProximaInspeccion) {
      worksheet.getCell('D84').value = inspection.vehicle.fechaProximaInspeccion;
    }

    // Responsable próxima inspección
    if (inspection.vehicle.responsableProximaInspeccion) {
      worksheet.getCell('D82').value = inspection.vehicle.responsableProximaInspeccion;
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
      { id: 'section_0', startRow: 17, endRow: 27, name: 'COMPARTIMIENTO MOTOR' },
      { id: 'section_1', startRow: 29, endRow: 37, name: 'LUCES' },
      { id: 'section_2', startRow: 39, endRow: 63, name: 'DOCUMENTOS Y ACCESORIOS' },
      { id: 'section_3', startRow: 65, endRow: 68, name: 'NEUMÁTICOS' },
      { id: 'compartimientoMotor', startRow: 17, endRow: 27, name: 'COMPARTIMIENTO MOTOR' },
      { id: 'luces', startRow: 29, endRow: 37, name: 'LUCES' },
      { id: 'documentosAccesorios', startRow: 39, endRow: 63, name: 'DOCUMENTOS Y ACCESORIOS' },
      { id: 'neumaticos', startRow: 65, endRow: 68, name: 'NEUMÁTICOS' },
    ];

    // Columnas fijas
    const buenoCol = 'F';
    const maloCol = 'G';
    const naCol = 'H';
    const observacionesCol = 'I';

    // Procesar cada sección que exista en las respuestas
    Object.entries(inspection.responses).forEach(([sectionId, sectionResponses], index) => {
      
      // Encontrar configuración para esta sección
      let sectionConfig = allSections.find(s => s.id === sectionId);
      
      // Si no se encuentra por ID exacto, usar por índice
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

      // Procesar preguntas
      Object.entries(sectionResponses as Record<string, any>).forEach(([questionId, response]) => {
        if (currentRow > sectionConfig.endRow) {
          this.logger.warn(`Límite excedido en ${sectionConfig.name}`);
          return;
        }

        try {
          // Limpiar celdas
          worksheet.getCell(`${buenoCol}${currentRow}`).value = '';
          worksheet.getCell(`${maloCol}${currentRow}`).value = '';
          worksheet.getCell(`${naCol}${currentRow}`).value = '';

          // Procesar respuesta
          if (response.value !== undefined && response.value !== null) {
            const valor = String(response.value).toLowerCase().trim();
            
            if (valor === 'bueno' || valor === 'si' || valor === 'true' || valor === '1') {
              worksheet.getCell(`${buenoCol}${currentRow}`).value = 'X';
            } else if (valor === 'malo' || valor === 'no' || valor === 'false' || valor === '0') {
              worksheet.getCell(`${maloCol}${currentRow}`).value = 'X';
            } else if (valor === 'na' || valor === 'n/a') {
              worksheet.getCell(`${naCol}${currentRow}`).value = 'X';
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
      });
    });

    this.logger.log('Respuestas completadas exitosamente');
  } catch (error) {
    this.logger.error(`Error al llenar respuestas: ${error.message}`);
    throw error;
  }
}
  /**
   * Llena el diagrama de daños del vehículo
   */
  private async llenarDiagramaDanios(
  worksheet: ExcelJS.Worksheet,
  inspection: InspectionHerraEquipos,
) {
  try {
    if (!inspection.vehicle) {
      return;
    }

    this.logger.log('Procesando diagrama de daños');

    // Insertar imagen del diagrama de daños expandida en H71 hasta L85
    if (inspection.vehicle.damageImageBase64) {
      await this.insertarImagenExpandida(
        worksheet,
        inspection.vehicle.damageImageBase64,
        'H69', // Celda inicial
        'N86'  // Celda final
      );
    }

    this.logger.log('Diagrama de daños completado');
  } catch (error) {
    this.logger.error(`Error al llenar diagrama de daños: ${error.message}`);
    throw error;
  }
}

private async insertarImagenExpandida(
  worksheet: ExcelJS.Worksheet,
  base64Image: string,
  startCell: string,
  endCell: string,
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

    const startCoords = this.getCellCoordinates(startCell);
    const endCoords = this.getCellCoordinates(endCell);
    
    // Insertar imagen que cubra desde H71 hasta L85
    worksheet.addImage(imageId, {
      tl: { col: startCoords.col - 1, row: startCoords.row - 1 } as ExcelJS.Anchor,
      br: { col: endCoords.col, row: endCoords.row } as ExcelJS.Anchor,
      editAs: 'oneCell',
    });

    // Ajustar alturas de las filas del rango para mejor visualización
    

    this.logger.log(`Imagen expandida insertada desde ${startCell} hasta ${endCell}`);
  } catch (error) {
    this.logger.error(`Error al insertar imagen expandida: ${error.message}`);
    throw error;
  }
}


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
        worksheet.getCell('A74').value = inspection.generalObservations;
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
        nombre: 'A85',
        firma: 'A83',
        fecha: 'B85', 
        cargo: 'A70'
      },
      supervisor: {
        nombre: 'E85',
        firma: 'E83',
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
      
      //if (sup.supervisorName) worksheet.getCell(posiciones.supervisor.nombre).value = sup.supervisorName;
      
      if (sup.supervisorSignature && typeof sup.supervisorSignature === 'string' && sup.supervisorSignature.startsWith('data:image/')) {
        await this.insertarImagen(worksheet, sup.supervisorSignature, posiciones.supervisor.firma);
      }
      
    //  if (sup.supervisorDate) worksheet.getCell(posiciones.supervisor.fecha).value = sup.supervisorDate;
    //  if (sup.cargo) worksheet.getCell(posiciones.supervisor.cargo).value = sup.cargo;
    }

    // Ajustar altura de filas para las imágenes de firma
    worksheet.getRow(69).height = 40;

    this.logger.log('Firmas completadas exitosamente');
  } catch (error) {
    this.logger.error(`Error al llenar firmas: ${error.message}`);
    throw error;
  }
}

private async agregarFormasGeometricas(worksheet: ExcelJS.Worksheet) {
  try {
    this.logger.log('Agregando formas geométricas - enfoque conservador');

    // Solo estos 3 ajustes básicos:
    const COLOR_PLOMO = 'FF808080';  // Color plomo para las formas
    const TAMANIO_FUENTE = 8;       // Tamaño fijo
    const FUENTE_SIMBOLOS = 'Segoe UI Symbol'; // Fuente para símbolos

    // Solo estas 3 celdas específicas
    const celdasFormas = [
      { celda: 'B71', caracter: '▲', nombre: 'Triángulo' },
      { celda: 'D71', caracter: '●', nombre: 'Círculo' },
      { celda: 'F71', caracter: '◆', nombre: 'Rombo' }
    ];

    // Procesar CADA CELDA individualmente
    celdasFormas.forEach(config => {
      try {
        const cell = worksheet.getCell(config.celda);
        
        // ⚠️ SOLO 3 CAMBIOS POR CELDA:
        // 1. Valor (el carácter)
        cell.value = config.caracter;
        
        // 2. Fuente (solo tamaño y color)
        cell.font = { 
          size: TAMANIO_FUENTE, 
          color: { argb: COLOR_PLOMO },
          name: FUENTE_SIMBOLOS
          // ❌ NO modificar bold, italic, etc.
        };
        
        // 3. Alineación (solo centrado)
        cell.alignment = { 
          horizontal: 'center', 
          vertical: 'middle' 
          // ❌ NO modificar wrapText, rotation, etc.
        };

        this.logger.log(`✅ ${config.nombre} agregado en ${config.celda}`);

      } catch (error) {
        this.logger.error(`Error en ${config.celda}: ${error.message}`);
      }
    });

  } catch (error) {
    this.logger.error('Error en método conservador: ' + error.message);
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
      await this.llenarDatosVehiculo(worksheet, inspection);
      await this.llenarRespuestas(worksheet, inspection);
      await this.llenarDiagramaDanios(worksheet, inspection);
      await this.llenarObservacionesGenerales(worksheet, inspection);
      await this.llenarFirmas(worksheet, inspection);
      await this.agregarFormasGeometricas(worksheet);

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
