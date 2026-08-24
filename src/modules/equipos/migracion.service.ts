import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Equipo, EquipoDocument } from './schemas/equipo.schema';
import { UbicacionService } from '../ubicacion/ubicacion.service';
import { ClasificacionService } from '../clasificacion/clasificacion.service';
import {
  DestinoEquipo,
  DestinoNoResuelto,
  ResolucionOrganizacionalService,
} from './importacion/resolucion-organizacional.service';
import { normalizarNombre } from '../../common/utils/nombres-organizacion.util';

export interface MigracionResultado {
  exito: boolean;
  creados: number;
  actualizados: number;
  omitidos: number;
  detalles: string[];
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Cabeceras de una hoja, ya localizadas por columna. */
interface Cabeceras {
  /** nombre en minúsculas → número de columna */
  mapa: Record<string, number>;
  /** nombre tal cual aparece en la hoja → número de columna */
  original: Record<string, number>;
}

@Injectable()
export class MigracionService {
  private readonly logger = new Logger(MigracionService.name);
  private readonly localExcelPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'Inventario.xlsx',
  );

  /** Hojas de configuración del libro; no son inventario. */
  private readonly hojasIgnorar = [
    'Hoja1',
    'Hoja2',
    'Hoja3',
    'ParaCopiar (2)',
    'ParaCopiar',
  ];

  /**
   * Hojas que **no** son un solo tipo de equipo: el tipo sale de la columna
   * «Item», no del nombre de la hoja.
   *
   * `ArnesAuConAncl` es una sola hoja porque los cuatro grupos comparten el
   * formato del inventario, pero dentro conviven cinco equipos distintos
   * (`Arnes`, `ConectorTT`, `ConectorAN`, `Autoretractil`, `Retractil`) que se
   * inspeccionan por separado. Guardarlos todos como «ArnesAuConAncl» obligaba
   * a elegir entre 1.425 equipos en el selector.
   *
   * Va declarado a mano, y no deducido de «la hoja tiene varios Items», para
   * que una errata de captura no invente un tipo de equipo en silencio. Cuando
   * una hoja se subdivide sin declararse, el importador lo avisa en el informe.
   */
  private readonly hojasSubdivididasPorItem = new Set(['ArnesAuConAncl']);

  /**
   * Columnas que ya tienen un campo propio en el modelo. Todo lo demás de la
   * hoja se guarda como especificación dinámica, que es lo que permite que
   * «Normativa» o «Tipo de vehículo» lleguen sin tocar el esquema.
   */
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
    'cod. nuevo asig',
    'codigo de parte',
    'código de parte',
    'ubicación',
    'ubicacion',
    'frecuencia de uso',
    'estado',
    'observaciones',
    'responsable',
    'placa',
    'id', // ID de las tablas de validación del libro
  ];

  /** Nombres de columna que traen el identificador físico RFID. */
  private readonly clavesRfid = ['id unico rfid (epc)', 'id único rfid (epc)'];

  /** Valor que el inventario usa para «no clasificado». */
  private readonly clasificacionVacia = 'SIN CLASIFICACION';

  constructor(
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<EquipoDocument>,
    private readonly ubicacionService: UbicacionService,
    private readonly clasificacionService: ClasificacionService,
    private readonly resolucion: ResolucionOrganizacionalService,
  ) {}

  async ejecutarMigracionDesdePath(): Promise<MigracionResultado> {
    this.logger.log(
      `Iniciando migración desde archivo local: ${this.localExcelPath}`,
    );
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(this.localExcelPath);
      return await this.procesarLibroExcel(workbook);
    } catch (error) {
      const detalle = mensajeDeError(error);
      this.logger.error(`Error al leer archivo de Excel: ${detalle}`);
      throw new Error(`Error en migración: ${detalle}`);
    }
  }

  async ejecutarMigracionDesdeBuffer(
    buffer: Buffer,
  ): Promise<MigracionResultado> {
    this.logger.log('Iniciando migración desde buffer subido por HTTP');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
      return await this.procesarLibroExcel(workbook);
    } catch (error) {
      const detalle = mensajeDeError(error);
      this.logger.error(`Error al cargar buffer de Excel: ${detalle}`);
      throw new Error(`Error en migración: ${detalle}`);
    }
  }

  private async procesarLibroExcel(
    workbook: ExcelJS.Workbook,
  ): Promise<MigracionResultado> {
    await this.resolucion.precargar();

    const total: MigracionResultado = {
      exito: true,
      creados: 0,
      actualizados: 0,
      omitidos: 0,
      detalles: [],
    };

    for (const sheet of workbook.worksheets) {
      if (this.hojasIgnorar.includes(sheet.name) || sheet.rowCount === 0) {
        continue;
      }
      await this.procesarHoja(sheet, total);
    }

    this.logger.log(
      `Migración terminada: ${total.creados} creados, ${total.actualizados} actualizados, ${total.omitidos} omitidos`,
    );
    return total;
  }

  private async procesarHoja(
    sheet: ExcelJS.Worksheet,
    total: MigracionResultado,
  ): Promise<void> {
    const cabeceras = this.leerCabeceras(sheet);

    const colCodigo =
      cabeceras.mapa['cód. nuevo asig'] ??
      cabeceras.mapa['cod. nuevo asig'] ??
      cabeceras.mapa['codigo interno'];
    if (!colCodigo) {
      total.detalles.push(
        `Hoja '${sheet.name}' omitida: no se encontró la columna 'Cód. Nuevo Asig'`,
      );
      return;
    }

    const colRfid = this.clavesRfid
      .map((k) => cabeceras.mapa[k])
      .find((c) => c !== undefined);

    // Columnas que ya viajan en un campo propio y no deben duplicarse dentro
    // de `especificaciones`.
    const columnasPropias = new Set<number>([colCodigo]);
    if (colRfid) columnasPropias.add(colRfid);

    const clasificacionHoja = this.clasificacionPredominante(sheet, cabeceras);

    // Una hoja subdividida aporta varios tipos de equipo; el resto, uno solo.
    const tipoPorItem = this.hojasSubdivididasPorItem.has(sheet.name);
    const items = this.itemsDistintos(sheet, cabeceras);
    if (!tipoPorItem && items.length > 1) {
      total.detalles.push(
        `Hoja '${sheet.name}': la columna 'Item' trae ${items.length} valores ` +
          `distintos (${items.join(', ')}). Si son tipos de equipo distintos, ` +
          `declarar la hoja en 'hojasSubdivididasPorItem'; por ahora todos se ` +
          `guardan como '${sheet.name}'.`,
      );
    }

    this.logger.log(
      `Procesando hoja '${sheet.name}': código en columna ${colCodigo}` +
        (colRfid ? `, RFID en columna ${colRfid}` : ', sin columna RFID') +
        (clasificacionHoja ? `, clasificación '${clasificacionHoja}'` : '') +
        (tipoPorItem
          ? `, tipo por 'Item' (${items.length}: ${items.join(', ')})`
          : ''),
    );

    // Un mismo par (código, RFID) repetido dentro de la hoja no es un equipo
    // que cambió: es un error de captura. Sin esto la segunda fila pisaba
    // silenciosamente a la primera.
    const vistos = new Map<string, number>();

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const codigo = this.getCellStringValue(row.getCell(colCodigo));

      if (this.esCodigoInvalido(codigo)) continue;

      const item = this.valor(row, cabeceras, ['item']);
      const areaTexto = this.valor(row, cabeceras, ['area']);
      if (!item && !areaTexto) continue;

      const rfid = colRfid
        ? this.getCellStringValue(row.getCell(colRfid)) || undefined
        : undefined;

      const clave = `${codigo}|${rfid ?? ''}`;
      const filaPrevia = vistos.get(clave);
      if (filaPrevia !== undefined) {
        total.omitidos++;
        total.detalles.push(
          `'${sheet.name}' fila ${r}: '${codigo}'${rfid ? ` / ${rfid}` : ''} ya aparece en la fila ${filaPrevia}; se conserva la primera.`,
        );
        continue;
      }
      vistos.set(clave, r);

      try {
        await this.guardarFila({
          sheet,
          row,
          cabeceras,
          codigo,
          rfid,
          item,
          areaTexto,
          columnasPropias,
          clasificacionHoja,
          tipoPorItem,
          total,
        });
      } catch (err) {
        if (err instanceof DestinoNoResuelto) {
          total.omitidos++;
          total.detalles.push(
            `'${sheet.name}' fila ${r} ('${codigo}'): ${err.message}`,
          );
          continue;
        }
        const detalle = mensajeDeError(err);
        this.logger.error(
          `Error procesando fila ${r} en '${sheet.name}': ${detalle}`,
        );
        total.omitidos++;
        total.detalles.push(
          `Error en fila ${r} de '${sheet.name}': ${detalle}`,
        );
      }
    }
  }

  private async guardarFila(ctx: {
    sheet: ExcelJS.Worksheet;
    row: ExcelJS.Row;
    cabeceras: Cabeceras;
    codigo: string;
    rfid?: string;
    item?: string;
    areaTexto?: string;
    columnasPropias: Set<number>;
    clasificacionHoja?: string;
    tipoPorItem: boolean;
    total: MigracionResultado;
  }): Promise<void> {
    const { sheet, row, cabeceras, codigo, rfid, item, total } = ctx;

    const responsable = this.valor(row, cabeceras, ['responsable']);
    const destino: DestinoEquipo = this.resolucion.resolver(
      ctx.areaTexto ?? '',
      responsable,
    );

    const ubicacionTexto =
      this.valor(row, cabeceras, ['ubicación', 'ubicacion']) ?? 'Sin Ubicación';
    const ubicacion =
      await this.ubicacionService.findByNameOrCreate(ubicacionTexto);

    const clasificacionTexto =
      this.clasificacionDeFila(row, cabeceras) ??
      ctx.clasificacionHoja ??
      item ??
      'Sin Clasificación';
    const clasificacion =
      await this.clasificacionService.findByNameOrCreate(clasificacionTexto);

    const cantidad = Number(this.valor(row, cabeceras, ['cantidad']) ?? 1);

    // En una hoja subdividida el tipo lo pone la fila. Si esa celda quedó
    // vacía se cae al nombre de la hoja —el equipo se guarda igual— pero se
    // avisa, porque significa que no aparecerá en el formulario de su tipo.
    let tipoEquipo = sheet.name;
    if (ctx.tipoPorItem) {
      if (item) {
        tipoEquipo = item;
      } else {
        total.detalles.push(
          `'${sheet.name}' fila ${row.number} ('${codigo}'): sin 'Item'; ` +
            `se guarda como '${sheet.name}'.`,
        );
      }
    }

    const datos: Record<string, unknown> = {
      codigo,
      rfid,
      // La hoja de vehículos casi no trae descripción; el `Item` («Vehiculo»)
      // es lo que hace legible al equipo en el selector de inspección.
      descripcion:
        this.valor(row, cabeceras, [
          'descripción del equipo',
          'descripcion del equipo',
        ]) ?? `${item ?? sheet.name} ${codigo}`,
      marca: this.valor(row, cabeceras, ['marca']),
      modelo: this.valor(row, cabeceras, ['modelo']),
      cantidad: Number.isNaN(cantidad) ? 1 : cantidad,
      codigo_antiguo: this.valor(row, cabeceras, [
        'cod. antiguo',
        'codigo antiguo',
      ]),
      num_serie: this.valor(row, cabeceras, [
        'número de serie',
        'numero de serie',
        'nº de serie',
      ]),
      codigo_parte: this.valor(row, cabeceras, [
        'codigo de parte',
        'código de parte',
      ]),
      // La hoja de vehículos todavía no trae esta columna: el número interno y
      // la placa comparten «Cód. Nuevo Asig». En cuanto se agregue una columna
      // «Placa» el importador la toma sin más cambios.
      placa: this.valor(row, cabeceras, ['placa']),
      frecuencia_uso: this.valor(row, cabeceras, ['frecuencia de uso']),
      estado: this.valor(row, cabeceras, ['estado']),
      observaciones: this.valor(row, cabeceras, ['observaciones']),
      responsable,
      tipo_equipo: tipoEquipo,
      ambito: destino.ambito,
      area_id: destino.area_id,
      superintendencia_id: destino.superintendencia_id,
      gerencia_id: destino.gerencia_id,
      subarea: destino.subarea,
      ubicacion_id: ubicacion._id as Types.ObjectId,
      clasificacion_id: clasificacion._id as Types.ObjectId,
    };

    // La identidad es el par (código, RFID). `rfid: null` alcanza también a los
    // documentos que no tienen el campo, que es el caso de todo lo que no lleva
    // tag físico.
    const existente = await this.equipoModel
      .findOne({ codigo, rfid: rfid ?? null })
      .exec();

    // Las especificaciones se **fusionan**, no se reemplazan: el panel de
    // equipos escribe en el mismo objeto, y una columna que el Excel no tiene
    // (porque se llenó a mano) desaparecía en la siguiente importación. El
    // Excel manda sobre sus propias columnas; lo demás se conserva.
    const delExcel = this.especificaciones(row, cabeceras, ctx.columnasPropias);
    datos.especificaciones = existente
      ? { ...(existente.especificaciones ?? {}), ...delExcel }
      : delExcel;

    if (existente) {
      // Un equipo que sube de ámbito deja de pertenecer al anterior. Sin el
      // `$unset` quedaría con dos referencias y el selector lo mostraría dos
      // veces.
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};
      for (const [k, v] of Object.entries(datos)) {
        if (v === undefined) unset[k] = '';
        else set[k] = v;
      }
      await this.equipoModel
        .findByIdAndUpdate(existente._id, { $set: set, $unset: unset })
        .exec();
      total.actualizados++;
    } else {
      await new this.equipoModel(datos).save();
      total.creados++;
    }
  }

  // ── Lectura de la hoja ──────────────────────────────────────────────────

  /**
   * Cabeceras de la fila 1, desde la primera columna con texto hasta el primer
   * hueco.
   *
   * Las hojas del inventario tienen las tablas de validación («ID», «Area»,
   * «Estado»…) a la derecha, separadas por una columna vacía. Antes se cortaba
   * en la columna 20 por si acaso, y eso dejaba fuera «Observaciones» en la
   * hoja de amoladoras, que llega hasta la 21.
   */
  private leerCabeceras(sheet: ExcelJS.Worksheet): Cabeceras {
    const mapa: Record<string, number> = {};
    const original: Record<string, number> = {};
    let empezo = false;

    for (let c = 1; c <= sheet.columnCount; c++) {
      const texto = this.getCellStringValue(sheet.getCell(1, c));
      if (!texto) {
        if (empezo) break; // fin del bloque de datos
        continue; // columnas vacías a la izquierda
      }
      empezo = true;
      const clave = texto.toLowerCase();
      // La primera ocurrencia manda: si una cabecera se repite, la de la
      // izquierda es la del bloque de datos.
      if (mapa[clave] === undefined) mapa[clave] = c;
      if (original[texto] === undefined) original[texto] = c;
    }
    return { mapa, original };
  }

  /**
   * Clasificación más frecuente de la hoja, ignorando las celdas vacías y los
   * «Sin clasificación».
   *
   * En el inventario de SPCC solo 34 de 1.425 filas traen la clasificación
   * escrita; las demás están en blanco pero son lo mismo. Deducirla de la hoja
   * evita 1.391 equipos sin clasificar.
   */
  private clasificacionPredominante(
    sheet: ExcelJS.Worksheet,
    cabeceras: Cabeceras,
  ): string | undefined {
    const col =
      cabeceras.mapa['clasificacion'] ?? cabeceras.mapa['clasificación'];
    if (!col) return undefined;

    const cuenta = new Map<string, number>();
    for (let r = 2; r <= sheet.rowCount; r++) {
      const v = this.getCellStringValue(sheet.getRow(r).getCell(col));
      if (!v || normalizarNombre(v) === this.clasificacionVacia) continue;
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    }
    if (cuenta.size === 0) return undefined;

    return [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Valores distintos de la columna «Item», de más a menos frecuentes.
   *
   * Sirve para dos cosas: saber en qué tipos se divide una hoja declarada como
   * subdividida, y detectar las que se subdividieron en el Excel sin avisar.
   */
  private itemsDistintos(
    sheet: ExcelJS.Worksheet,
    cabeceras: Cabeceras,
  ): string[] {
    const col = cabeceras.mapa['item'];
    if (!col) return [];

    const cuenta = new Map<string, number>();
    for (let r = 2; r <= sheet.rowCount; r++) {
      const v = this.getCellStringValue(sheet.getRow(r).getCell(col));
      if (!v || this.esCodigoInvalido(v)) continue;
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    }
    return [...cuenta].sort((a, b) => b[1] - a[1]).map(([nombre]) => nombre);
  }

  private clasificacionDeFila(
    row: ExcelJS.Row,
    cabeceras: Cabeceras,
  ): string | undefined {
    const v = this.valor(row, cabeceras, ['clasificacion', 'clasificación']);
    if (!v || normalizarNombre(v) === this.clasificacionVacia) return undefined;
    return v;
  }

  /** Todo lo que la hoja trae y el modelo no tiene como campo propio. */
  private especificaciones(
    row: ExcelJS.Row,
    cabeceras: Cabeceras,
    columnasPropias: Set<number>,
  ): Record<string, string> {
    const specs: Record<string, string> = {};
    for (const [nombre, col] of Object.entries(cabeceras.original)) {
      if (columnasPropias.has(col)) continue;
      if (this.camposComunesExcel.includes(nombre.toLowerCase())) continue;
      const valor = this.getCellStringValue(row.getCell(col));
      if (valor !== '') specs[nombre] = valor;
    }
    return specs;
  }

  /**
   * Los códigos del inventario salen de una fórmula que concatena área e ítem;
   * cuando falta alguno la celda queda con un marcador o con un error de Excel.
   */
  private esCodigoInvalido(codigo: string): boolean {
    if (!codigo) return true;
    return (
      codigo.startsWith('SinItem') ||
      codigo.startsWith('SinArea') ||
      codigo.startsWith('-SinArea') ||
      codigo.includes('#VALUE!') ||
      codigo.includes('#NAME?')
    );
  }

  // ── Celdas ──────────────────────────────────────────────────────────────

  private getCellStringValue(cell: ExcelJS.Cell): string {
    if (!cell || cell.value === undefined || cell.value === null) {
      return '';
    }

    let val: unknown = cell.value;

    // 1. Fórmula
    if (typeof val === 'object' && val !== null && 'result' in val) {
      const res = (val as { result: unknown }).result;
      if (res === undefined || res === null) return '';
      val = res;
    }

    // 2. Hipervínculo
    if (val && typeof val === 'object' && 'text' in val) {
      const txt = (val as { text: unknown }).text;
      if (txt === undefined || txt === null) return '';
      val = txt;
    }

    // 3. Texto enriquecido
    if (val && typeof val === 'object' && 'richText' in val) {
      const richText = (val as { richText: unknown }).richText;
      if (Array.isArray(richText)) {
        return this.unirFragmentos(richText);
      }
    }

    if (Array.isArray(val)) {
      return this.unirFragmentos(val);
    }

    if (typeof val === 'object') return '';

    return String(val as string | number | boolean).trim();
  }

  /** Concatena los trozos de una celda partida en fragmentos de texto. */
  private unirFragmentos(fragmentos: unknown[]): string {
    return fragmentos
      .map((f) => {
        if (f === null || f === undefined) return '';
        if (typeof f === 'object') {
          const texto = (f as { text?: unknown }).text;
          return typeof texto === 'string' ? texto : '';
        }
        return String(f as string | number | boolean);
      })
      .join('')
      .trim();
  }

  /** Primer valor no vacío entre varios nombres posibles de columna. */
  private valor(
    row: ExcelJS.Row,
    cabeceras: Cabeceras,
    claves: string[],
  ): string | undefined {
    for (const clave of claves) {
      const col = cabeceras.mapa[clave];
      if (col === undefined) continue;
      const val = this.getCellStringValue(row.getCell(col));
      if (val !== '') return val;
    }
    return undefined;
  }
}
