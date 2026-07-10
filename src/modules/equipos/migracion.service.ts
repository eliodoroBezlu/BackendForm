import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Equipo, EquipoDocument } from './schemas/equipo.schema';
import { UbicacionService } from '../ubicacion/ubicacion.service';
import { ClasificacionService } from '../clasificacion/clasificacion.service';

@Injectable()
export class MigracionService {
  private readonly logger = new Logger(MigracionService.name);
  private readonly localExcelPath = path.join(process.cwd(), 'src', 'templates', 'Inventario.xlsx');

  // Mapeamos los nombres comunes para ignorarlos al extraer especificaciones dinámicas
  private readonly camposComunesExcel = [
    'item',
    'area',
    'cantidad',
    'clasificacion',
    'clasificación',
    'descripción del equipo',
    'descripcion del equipo',
    'marca',
    'modelo',
    'cod. antiguo',
    'codigo antiguo',
    'número de serie',
    'numero de serie',
    'nº de serie',
    'cód. nuevo asig',
    'codigo interno',
    'cod. nuevo asig',
    'codigo de parte',
    'código de parte',
    'ubicación',
    'ubicacion',
    'frecuencia de uso',
    'estado',
    'observaciones',
    'id', // ID temporal del excel
  ];

  constructor(
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<EquipoDocument>,
    @InjectModel('Area')
    private readonly areaModel: Model<any>,
    @InjectModel('Superintendencia')
    private readonly superModel: Model<any>,
    private readonly ubicacionService: UbicacionService,
    private readonly clasificacionService: ClasificacionService,
  ) {}

  async ejecutarMigracionDesdePath(): Promise<any> {
    this.logger.log(`Iniciando migración desde archivo local: ${this.localExcelPath}`);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(this.localExcelPath);
      return await this.procesarLibroExcel(workbook);
    } catch (error) {
      this.logger.error(`Error al leer archivo de Excel: ${error.message}`);
      throw new Error(`Error en migración: ${error.message}`);
    }
  }

  async ejecutarMigracionDesdeBuffer(buffer: Buffer): Promise<any> {
    this.logger.log('Iniciando migración desde buffer subido por HTTP');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
      return await this.procesarLibroExcel(workbook);
    } catch (error) {
      this.logger.error(`Error al cargar buffer de Excel: ${error.message}`);
      throw new Error(`Error en migración: ${error.message}`);
    }
  }

  private async procesarLibroExcel(workbook: ExcelJS.Workbook): Promise<any> {
    let creadosCount = 0;
    let actualizadosCount = 0;
    let omitidosCount = 0;
    const detalles: string[] = [];

    // Hojas a procesar (las primeras 8 hojas de herramientas, excluyendo las hojas de config "Hoja1", "Hoja2", "Hoja3")
    const hojasIgnorar = ['Hoja1', 'Hoja2', 'Hoja3', 'ParaCopiar (2)', 'ParaCopiar'];
    
    for (const sheet of workbook.worksheets) {
      if (hojasIgnorar.includes(sheet.name) || sheet.rowCount === 0) {
        continue;
      }

      this.logger.log(`Procesando hoja: ${sheet.name}`);
      
      // Leer fila 1 para mapear encabezados
      const headerRow = sheet.getRow(1);
      const headerMap: Record<string, number> = {};
      
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 20) return; // Ignorar columnas de validación después de la 20 para evitar colisiones
        if (cell.value) {
          const nameClean = cell.value.toString().toLowerCase().trim();
          headerMap[nameClean] = colNumber;
        }
      });

      // Validar si existe la columna de código único para identificar los registros
      const colCodigo = headerMap['cód. nuevo asig'] || headerMap['codigo interno'] || headerMap['cod. nuevo asig'];
      if (!colCodigo) {
        detalles.push(`Hoja '${sheet.name}' omitida: No se encontró columna 'Cód. Nuevo Asig' o 'Código Interno'`);
        continue;
      }

      const colItem = headerMap['item'];
      const colArea = headerMap['area'];

      // Procesar filas de datos
      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cellCodigo = row.getCell(colCodigo);
        const codigo = this.getCellStringValue(cellCodigo);
        
        if (
          !codigo ||
          codigo.startsWith('SinItem') ||
          codigo.startsWith('SinArea') ||
          codigo.startsWith('-SinArea') ||
          codigo.includes('#VALUE!') ||
          codigo.includes('#NAME?') ||
          codigo === '-SinArea-0000'
        ) {
          continue; // Descartar filas con códigos de error/fórmulas vacías
        }

        const itemName = colItem ? this.getCellStringValue(row.getCell(colItem)) : '';
        const areaName = colArea ? this.getCellStringValue(row.getCell(colArea)) : '';
        if (!itemName && !areaName) {
          continue; // Descartar filas vacías
        }

        try {
          // 1. Extraer campos comunes
          const areaNameRaw = this.getCellValue(row, headerMap, ['area']) || 'Sin Área';
          const cantidadRaw = this.getCellValue(row, headerMap, ['cantidad']);
          const clasificacionRaw = this.getCellValue(row, headerMap, ['clasificacion', 'clasificación']) || 'Sin Clasificación';
          const descripcion = this.getCellValue(row, headerMap, ['descripción del equipo', 'descripcion del equipo']) || `${sheet.name} ${codigo}`;
          const marca = this.getCellValue(row, headerMap, ['marca']);
          const modelo = this.getCellValue(row, headerMap, ['modelo']);
          const codigo_antiguo = this.getCellValue(row, headerMap, ['cod. antiguo', 'codigo antiguo']);
          const num_serie = this.getCellValue(row, headerMap, ['número de serie', 'numero de serie', 'nº de serie']);
          const codigo_parte = this.getCellValue(row, headerMap, ['codigo de parte', 'código de parte']);
          const ubicacionNameRaw = this.getCellValue(row, headerMap, ['ubicación', 'ubicacion']) || 'Sin Ubicación';
          const frecuencia_uso = this.getCellValue(row, headerMap, ['frecuencia de uso']);
          const estado = this.getCellValue(row, headerMap, ['estado']);
          const observaciones = this.getCellValue(row, headerMap, ['observaciones']);

          // 2. Resolver Relaciones
          // 2.1 Area
          let areaNameSearch = areaNameRaw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
          const areaUpper = areaNameSearch.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          if (
            areaUpper === 'VIAS FERREAS' ||
            areaUpper === 'RECURSOS HIDRICOS Y VIAS FERREAS' ||
            areaUpper === 'RECURSOS HIDRICOS'
          ) {
            areaNameSearch = 'Recursos Hidricos';
          } else if (areaUpper === 'TALLER GENERAL') {
            areaNameSearch = 'Taller Soldadura';
          } else if (areaUpper === 'INSTRUMENTACION') {
            areaNameSearch = 'Instrumentacion';
          } else if (areaUpper === 'CHANCADO') {
            areaNameSearch = 'Chancado';
          } else if (areaUpper === 'MOLIENDA') {
            areaNameSearch = 'Molienda';
          } else if (areaUpper === 'FLOTACION') {
            areaNameSearch = 'Flotacion';
          } else if (areaUpper === 'FILTROS') {
            areaNameSearch = 'Filtros';
          } else if (areaUpper === 'LUBRICACION') {
            areaNameSearch = 'Lubricacion';
          } else if (areaUpper === 'ELECTRICO') {
            areaNameSearch = 'Electrico';
          } else if (areaUpper === 'CONFIABILIDAD') {
            areaNameSearch = 'Confiabilidad';
          } else if (areaUpper === 'GENERACION') {
            areaNameSearch = 'Generacion';
          } else if (areaUpper === 'PLANIFICACION') {
            areaNameSearch = 'Planificacion';
          }

          let area = await this.areaModel.findOne({
            nombre: { $regex: new RegExp(`^${this.escapeRegex(areaNameSearch)}$`, 'i') }
          }).exec();

          if (!area) {
            // Crear el área con la primera superintendencia de la base de datos
            const firstSuper = await this.superModel.findOne().exec();
            const superId = firstSuper ? firstSuper._id : new Types.ObjectId();
            area = new this.areaModel({
              nombre: areaNameSearch,
              superintendencia: superId,
              activo: true,
            });
            await area.save();
          }

          // 2.2 Ubicacion
          const ubicacion = await this.ubicacionService.findByNameOrCreate(ubicacionNameRaw);

          // 2.3 Clasificacion
          const clasificacion = await this.clasificacionService.findByNameOrCreate(clasificacionRaw);

          // 3. Extraer especificaciones dinámicas
          const especificaciones: Record<string, any> = {};
          headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber > 20) return; // Ignorar columnas de validación a la derecha
            if (cell.value) {
              const nameRaw = cell.value.toString().trim();
              const nameClean = nameRaw.toLowerCase();
              
              if (!this.camposComunesExcel.includes(nameClean)) {
                const cellVal = this.getCellStringValue(row.getCell(colNumber));
                if (cellVal !== '') {
                  // Guardamos con la clave original de la columna (ej: "Voltaje", "Carga Maxima")
                  especificaciones[nameRaw] = cellVal;
                }
              }
            }
          });

          // 4. Preparar datos
          const cantidad = cantidadRaw ? Number(cantidadRaw) : 1;
          const equipoData: Partial<Equipo> = {
            codigo,
            descripcion,
            marca,
            modelo,
            cantidad: isNaN(cantidad) ? 1 : cantidad,
            codigo_antiguo,
            num_serie,
            codigo_parte,
            frecuencia_uso,
            estado,
            observaciones,
            tipo_equipo: sheet.name,
            area_id: area._id as any,
            ubicacion_id: ubicacion._id as any,
            clasificacion_id: clasificacion._id as any,
            especificaciones,
          };

          // 5. Upsert
          const existing = await this.equipoModel.findOne({ codigo }).exec();
          if (existing) {
            await this.equipoModel.findByIdAndUpdate(existing._id, equipoData).exec();
            actualizadosCount++;
          } else {
            const created = new this.equipoModel(equipoData);
            await created.save();
            creadosCount++;
          }

        } catch (err) {
          this.logger.error(`Error procesando fila ${r} en '${sheet.name}': ${err.message}`);
          detalles.push(`Error en fila ${r} de '${sheet.name}': ${err.message}`);
        }
      }
    }

    return {
      exito: true,
      creados: creadosCount,
      actualizados: actualizadosCount,
      omitidos: omitidosCount,
      detalles,
    };
  }

  private getCellStringValue(cell: ExcelJS.Cell): string {
    if (!cell || cell.value === undefined || cell.value === null) {
      return '';
    }
    
    let val = cell.value;
    
    // 1. Formula
    if (typeof val === 'object' && 'result' in val) {
      const res = (val as any).result;
      if (res === undefined || res === null) {
        return '';
      }
      val = res;
    }
    
    // 2. Hyperlink
    if (val && typeof val === 'object' && 'text' in val) {
      const txt = (val as any).text;
      if (txt === undefined || txt === null) {
        return '';
      }
      val = txt;
    }
    
    // 3. RichText / Array of objects
    if (val && typeof val === 'object' && 'richText' in val) {
      const richText = (val as any).richText;
      if (Array.isArray(richText)) {
        return richText.map(rt => (rt && rt.text) ? rt.text : '').join('').trim();
      }
    }
    
    if (Array.isArray(val)) {
      return val.map(item => {
        if (item && typeof item === 'object' && 'text' in item) {
          return (item as any).text || '';
        }
        return item ? item.toString() : '';
      }).join('').trim();
    }
    
    if (typeof val === 'object') {
      return '';
    }
    
    return val.toString().trim();
  }

  private getCellValue(row: ExcelJS.Row, headerMap: Record<string, number>, keys: string[]): string | undefined {
    for (const key of keys) {
      const colIndex = headerMap[key];
      if (colIndex !== undefined) {
        const cell = row.getCell(colIndex);
        const val = this.getCellStringValue(cell);
        return val !== '' ? val : undefined;
      }
    }
    return undefined;
  }

  private escapeRegex(string: string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
}




