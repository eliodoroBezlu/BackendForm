import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { Equipo } from './schemas/equipo.schema';
import { resizeImageBuffer } from '../../common/utils/image-resize.util';

/**
 * Genera el Excel de inventario: una hoja por `tipo_equipo`, una fila por
 * equipo dentro de cada hoja.
 *
 * Dentro de un tipo, todos los equipos comparten el mismo set de
 * `especificaciones` (definido en config-formulario), así que las columnas
 * de esa hoja quedan consistentes. Un lote con varios tipos no se rechaza:
 * se agrupa, y cada tipo va a su propia hoja del mismo archivo — nunca se
 * mezclan columnas de tipos distintos en una sola hoja.
 *
 * Es la primera exportación del repo con columnas dinámicas armadas fila por
 * fila (`worksheet.addRow()`) — los exports existentes (inspecciones,
 * linternas) escriben sobre una plantilla `.xlsx` con celdas fijas, que no
 * sirve para una lista de largo variable.
 */
@Injectable()
export class EquiposExcelService {
  private static readonly COLUMNAS_FIJAS: Array<{
    header: string;
    key: string;
    width: number;
  }> = [
    { header: 'Código', key: 'codigo', width: 16 },
    { header: 'RFID', key: 'rfid', width: 18 },
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Descripción', key: 'descripcion', width: 32 },
    { header: 'Marca', key: 'marca', width: 16 },
    { header: 'Modelo', key: 'modelo', width: 16 },
    { header: 'Núm. Serie', key: 'num_serie', width: 16 },
    { header: 'Cantidad', key: 'cantidad', width: 10 },
    { header: 'Costo', key: 'costo', width: 12 },
    {
      header: 'Área / Superintendencia / Gerencia',
      key: 'ambitoTexto',
      width: 30,
    },
    { header: 'Ubicación', key: 'ubicacionTexto', width: 40 },
    { header: 'Clasificación', key: 'clasificacionTexto', width: 20 },
    { header: 'Responsable', key: 'responsable', width: 20 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Frecuencia de uso', key: 'frecuencia_uso', width: 16 },
    { header: 'Observaciones', key: 'observaciones', width: 30 },
  ];

  /**
   * Por encima de este número total de filas (sumando todas las hojas), se
   * omiten las fotos incrustadas en todo el archivo — cada una exige leer un
   * archivo de disco y reescalarlo. El export sigue generándose igual, solo
   * sin la columna de imagen poblada. Ver la nota de proceso en
   * mds/implementation_planExportarInventarioEquipos.md — el frontend avisa
   * al usuario antes de llegar a este límite; acá se aplica de todas formas,
   * sin confiar en que el frontend haya avisado.
   */
  static readonly LIMITE_FOTOS = 150;

  private readonly ALTO_FILA_FOTO = 60;

  /**
   * Nombres de hoja ya usados en este workbook, para desambiguar si dos
   * `tipo_equipo` distintos truncan al mismo nombre de 31 caracteres.
   */
  private nombresDeHojaUsados: Map<string, number>;

  async generar(
    equipos: Equipo[],
  ): Promise<{ buffer: Buffer; tipos: string[] }> {
    if (equipos.length === 0) {
      throw new BadRequestException('No hay equipos para exportar.');
    }

    const grupos = this.agruparPorTipo(equipos);
    const workbook = new ExcelJS.Workbook();
    const incluirFotos = equipos.length <= EquiposExcelService.LIMITE_FOTOS;
    this.nombresDeHojaUsados = new Map();

    for (const [tipoEquipo, equiposDelTipo] of grupos) {
      const hoja = workbook.addWorksheet(this.nombreHoja(tipoEquipo));
      await this.llenarHoja(hoja, equiposDelTipo, incluirFotos);
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    return { buffer, tipos: Array.from(grupos.keys()) };
  }

  private agruparPorTipo(equipos: Equipo[]): Map<string, Equipo[]> {
    const grupos = new Map<string, Equipo[]>();
    for (const equipo of equipos) {
      const lista = grupos.get(equipo.tipo_equipo);
      if (lista) {
        lista.push(equipo);
      } else {
        grupos.set(equipo.tipo_equipo, [equipo]);
      }
    }
    return grupos;
  }

  private async llenarHoja(
    hoja: ExcelJS.Worksheet,
    equipos: Equipo[],
    incluirFotos: boolean,
  ): Promise<void> {
    const clavesEspecificaciones = this.unirClavesEspecificaciones(equipos);
    hoja.columns = [
      { header: 'Foto', key: 'foto', width: 14 },
      ...EquiposExcelService.COLUMNAS_FIJAS,
      ...clavesEspecificaciones.map((clave) => ({
        header: clave,
        key: `spec__${clave}`,
        width: 18,
      })),
    ];
    hoja.getRow(1).font = { bold: true };

    for (const equipo of equipos) {
      const fila = hoja.addRow({
        codigo: equipo.codigo,
        rfid: equipo.rfid ?? '',
        placa: equipo.placa ?? '',
        descripcion: equipo.descripcion,
        marca: equipo.marca ?? '',
        modelo: equipo.modelo ?? '',
        num_serie: equipo.num_serie ?? '',
        cantidad: equipo.cantidad,
        costo: equipo.costo ?? '',
        ambitoTexto: this.textoAmbito(equipo),
        ubicacionTexto: this.rutaDe(equipo.ubicacion_id),
        clasificacionTexto: this.nombreDe(equipo.clasificacion_id),
        responsable: equipo.responsable ?? '',
        estado: equipo.estado ?? '',
        frecuencia_uso: equipo.frecuencia_uso ?? '',
        observaciones: equipo.observaciones ?? '',
        ...this.filaDeEspecificaciones(equipo, clavesEspecificaciones),
      });
      fila.height = this.ALTO_FILA_FOTO;

      if (incluirFotos) {
        await this.incrustarFoto(hoja, equipo, fila.number);
      }
    }
  }

  private nombreHoja(tipoEquipo: string): string {
    // Excel no admite \ / * ? : [ ] en el nombre de hoja, ni más de 31 chars.
    const limpio = tipoEquipo.replace(/[\\/*?:[\]]/g, ' ').trim();
    const base = (limpio || 'Inventario').slice(0, 31);

    const usos = this.nombresDeHojaUsados.get(base) ?? 0;
    this.nombresDeHojaUsados.set(base, usos + 1);
    if (usos === 0) return base;

    // Dos tipo_equipo distintos truncaron al mismo nombre de 31 chars: caso
    // raro, pero un nombre de hoja duplicado rompe la generación del xlsx.
    const sufijo = ` (${usos + 1})`;
    return base.slice(0, 31 - sufijo.length) + sufijo;
  }

  private nombreDe(ref: unknown): string {
    if (ref && typeof ref === 'object' && 'nombre' in ref) {
      return String((ref as { nombre?: unknown }).nombre ?? '');
    }
    return '';
  }

  /** La ruta completa de la ubicación («Taller › Bodega 1 › Estante A»). */
  private rutaDe(ref: unknown): string {
    if (ref && typeof ref === 'object' && 'ruta' in ref) {
      const ruta = (ref as { ruta?: unknown }).ruta;
      if (typeof ruta === 'string' && ruta) return ruta;
    }
    return this.nombreDe(ref);
  }

  private textoAmbito(equipo: Equipo): string {
    const area = this.nombreDe(equipo.area_id);
    if (area) return area;
    const superintendencia = this.nombreDe(equipo.superintendencia_id);
    if (superintendencia) return superintendencia;
    return this.nombreDe(equipo.gerencia_id);
  }

  private unirClavesEspecificaciones(equipos: Equipo[]): string[] {
    const claves = new Set<string>();
    for (const equipo of equipos) {
      Object.keys(equipo.especificaciones ?? {}).forEach((clave) =>
        claves.add(clave),
      );
    }
    return Array.from(claves).sort();
  }

  private filaDeEspecificaciones(
    equipo: Equipo,
    claves: string[],
  ): Record<string, unknown> {
    const fila: Record<string, unknown> = {};
    for (const clave of claves) {
      const valor = equipo.especificaciones?.[clave];
      fila[`spec__${clave}`] =
        valor === undefined || valor === null ? '' : String(valor);
    }
    return fila;
  }

  /**
   * Lee la foto de portada desde disco (misma carpeta que sirve
   * `useStaticAssets` en main.ts, resuelta igual que `rutaDeCarpeta()` en el
   * módulo `upload/`: relativa al directorio de trabajo del proceso) y la
   * incrusta en la columna "Foto" de la fila. Si el equipo no tiene fotos, o
   * el archivo no se puede leer (borrado a mano, ruta rota), se salta sin
   * romper el resto de la exportación.
   */
  private async incrustarFoto(
    hoja: ExcelJS.Worksheet,
    equipo: Equipo,
    filaNumero: number,
  ): Promise<void> {
    const portada = equipo.fotos?.[0];
    if (!portada?.url) return;

    try {
      const rutaRelativa = portada.url.replace(/^\/?uploads\//, '');
      const rutaAbsoluta = join(process.cwd(), 'uploads', rutaRelativa);
      const bufferOriginal = await readFile(rutaAbsoluta);
      const buffer = (await resizeImageBuffer(
        bufferOriginal,
        200,
        70,
      )) as unknown as ExcelJS.Buffer;

      const idImagen = hoja.workbook.addImage({ buffer, extension: 'jpeg' });
      hoja.addImage(idImagen, {
        tl: { col: 0, row: filaNumero - 1 } as ExcelJS.Anchor,
        br: { col: 1, row: filaNumero } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });
    } catch {
      // Foto no disponible: la celda queda vacía, no se interrumpe el export.
    }
  }
}
