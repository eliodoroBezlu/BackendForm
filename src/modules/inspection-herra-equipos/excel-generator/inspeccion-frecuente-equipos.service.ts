import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { InspectionHerraEquipos } from '../schemas/inspection-herra-equipos.schema';
import { resizeImageBuffer } from '../../../common/utils/image-resize.util';

/**
 * Generador de Excel de las inspecciones FRECUENTES de equipos de izaje y
 * montacargas (3.04.P37.F31 / F35 / F36 / F37).
 *
 * Las cuatro plantillas comparten exactamente el mismo formato —cabecera con
 * Inspector/Fecha/Horómetro/TAG, tabla `Nº | DESCRIPCIÓN | Bueno | Malo | N/A`,
 * bloque de OBSERVACIONES y firma del responsable— así que se resuelven con un
 * único servicio en vez de cuatro copias casi idénticas.
 *
 * A diferencia del resto de generadores del módulo, las filas de cada sección
 * **no** están hardcodeadas: se derivan leyendo la columna A de la plantilla
 * (título de sección = texto, pregunta = número). Así, si Seguridad reordena o
 * añade filas al Excel, el generador sigue cuadrando sin tocar código —que es
 * justo lo que rompe a los generadores con rangos fijos.
 */
@Injectable()
export class ExcelInspeccionFrecuenteService {
  private readonly logger = new Logger(ExcelInspeccionFrecuenteService.name);

  /** Código de plantilla → archivo en `src/templates/`. */
  private static readonly PLANTILLAS: Record<string, string> = {
    '3.04.P37.F31': 'Grua_AT_Rev.1.xlsx',
    '3.04.P37.F35': 'Grua_RT_Rev.1.xlsx',
    '3.04.P37.F36': 'Grua_Telescopicos_Rev.2.xlsx',
    '3.04.P37.F37': 'Montacargas_Telescopicos_Rev.1.xlsx',
  };

  /** Columnas de respuesta, comunes a las cuatro plantillas. */
  private static readonly COL = {
    bueno: 'AE',
    malo: 'AG',
    na: 'AI',
  };

  /**
   * Recuadro de la firma: en las cuatro plantillas la fila del rótulo tiene
   * `A:AD` con "Firma Responsable de la Inspección" y `AE:AJ` combinada y
   * vacía, que es donde va la imagen.
   */
  private static readonly FIRMA = { desde: 'AE', hasta: 'AJ' };

  getSupportedTemplateCodes(): string[] {
    return Object.keys(ExcelInspeccionFrecuenteService.PLANTILLAS);
  }

  canHandle(templateCode: string): boolean {
    return this.getSupportedTemplateCodes().some((code) =>
      templateCode.toUpperCase().includes(code.toUpperCase()),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Utilidades
  // ────────────────────────────────────────────────────────────────

  /** Texto plano de una celda (soporta richText, hyperlinks y fórmulas). */
  private texto(valor: ExcelJS.CellValue): string {
    let v: unknown = valor;
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (Array.isArray(obj.richText)) {
        v = (obj.richText as { text: string }[]).map((t) => t.text).join('');
      } else if (obj.text !== undefined) {
        v = obj.text;
      } else if (obj.result !== undefined) {
        v = obj.result;
      }
    }
    return String(v ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Normaliza una etiqueta para comparar sin tildes ni signos. */
  private normalizar(s: string): string {
    return s
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Busca un campo de verificación por etiqueta normalizada.
   *
   * Se busca por nombre y no por posición: el orden de `verificationFields`
   * depende de cómo se armó la plantilla y un cambio ahí desplazaría todos los
   * valores en silencio.
   */
  private valorVerificacion(
    verification: Record<string, unknown> | undefined,
    ...claves: string[]
  ): string {
    if (!verification) return '';
    const indice = new Map<string, string>();
    for (const [k, v] of Object.entries(verification)) {
      const valor = String(v ?? '').trim();
      if (valor) indice.set(this.normalizar(k), valor);
    }
    for (const clave of claves) {
      const v = indice.get(this.normalizar(clave));
      if (v) return v;
    }
    return '';
  }

  /** `2026-07-31` → `31/07/2026`. Deja intacto lo que no sea una fecha ISO. */
  private formatearFecha(valor: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
  }

  /** Escribe concatenando al rótulo que ya trae la plantilla ("TAG:" → "TAG: 123"). */
  private concatenar(
    worksheet: ExcelJS.Worksheet,
    celda: string,
    valor: string,
  ): void {
    if (!valor) return;
    const cell = worksheet.getCell(celda);
    const actual = this.texto(cell.value);
    cell.value = actual ? `${actual} ${valor}` : valor;
  }

  private coordenadas(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, '');
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ''), 10);
    let col = 0;
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return { row, col };
  }

  // ────────────────────────────────────────────────────────────────
  // Derivación del layout
  // ────────────────────────────────────────────────────────────────

  /**
   * Recorre la columna A y deduce dónde está cada sección, sus filas de
   * pregunta, el bloque de observaciones y la firma.
   */
  private derivarLayout(worksheet: ExcelJS.Worksheet): {
    secciones: { titulo: string; filas: number[] }[];
    filaObservaciones: number;
    filaFirma: number;
  } {
    // Cabecera de la tabla: la fila con "No" en A y "DESCRIPCIÓN" en B.
    let filaCabecera = 0;
    const limite = Math.min(worksheet.rowCount, 30);
    for (let r = 1; r <= limite; r++) {
      const a = this.texto(worksheet.getCell(`A${r}`).value).toUpperCase();
      const b = this.texto(worksheet.getCell(`B${r}`).value).toUpperCase();
      if (a === 'NO' && b.startsWith('DESCRIP')) {
        filaCabecera = r;
        break;
      }
    }
    if (!filaCabecera) {
      throw new Error(
        'No se encontró la fila de cabecera ("No" / "DESCRIPCIÓN") en la plantilla',
      );
    }

    const secciones: { titulo: string; filas: number[] }[] = [];
    let filaObservaciones = 0;
    let filaFirma = 0;

    for (let r = filaCabecera + 1; r <= worksheet.rowCount; r++) {
      const a = this.texto(worksheet.getCell(`A${r}`).value);
      if (!a) continue;

      if (a.toUpperCase().startsWith('OBSERVACION')) {
        filaObservaciones = r;
        for (let k = r + 1; k <= worksheet.rowCount; k++) {
          if (
            this.texto(worksheet.getCell(`A${k}`).value)
              .toUpperCase()
              .startsWith('FIRMA')
          ) {
            filaFirma = k;
            break;
          }
        }
        break;
      }

      if (/^\d+$/.test(a)) {
        // Fila de pregunta: pertenece a la última sección abierta.
        if (secciones.length) secciones[secciones.length - 1].filas.push(r);
      } else {
        secciones.push({ titulo: a, filas: [] });
      }
    }

    return { secciones, filaObservaciones, filaFirma };
  }

  // ────────────────────────────────────────────────────────────────
  // Llenado
  // ────────────────────────────────────────────────────────────────

  private llenarCabecera(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
  ): void {
    const verification = inspection.verification as
      | Record<string, unknown>
      | undefined;

    const inspector =
      inspection.inspectorSignature?.inspectorName ||
      inspection.inspectorSignature?.name ||
      '';
    const fecha =
      this.valorVerificacion(verification, 'Fecha', 'Fecha de inspección') ||
      (inspection.submittedAt
        ? new Date(inspection.submittedAt).toISOString().slice(0, 10)
        : '');

    this.concatenar(worksheet, 'A4', String(inspector));
    this.concatenar(worksheet, 'AE4', this.formatearFecha(fecha));
    this.concatenar(
      worksheet,
      'A5',
      this.valorVerificacion(verification, 'Horometro', 'Horómetro'),
    );
    this.concatenar(
      worksheet,
      'AE5',
      this.valorVerificacion(verification, 'Tag', 'TAG', 'Código'),
    );
  }

  /**
   * Marca `X` en Bueno/Malo/N-A por cada pregunta.
   *
   * Devuelve las observaciones por pregunta: la plantilla no tiene columna para
   * ellas, así que se arrastran al bloque general en vez de perderlas.
   */
  private llenarRespuestas(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
    secciones: { titulo: string; filas: number[] }[],
  ): string[] {
    const observacionesSueltas: string[] = [];
    const responses = (inspection.responses ?? {}) as Record<string, unknown>;
    const { COL } = ExcelInspeccionFrecuenteService;

    secciones.forEach((seccion, indiceSeccion) => {
      const respuestasSeccion = responses[`section_${indiceSeccion}`] as
        | Record<string, { value?: unknown; observacion?: string }>
        | undefined;
      if (!respuestasSeccion) return;

      seccion.filas.forEach((fila, indicePregunta) => {
        const respuesta = respuestasSeccion[`q${indicePregunta}`];
        if (!respuesta) return;

        worksheet.getCell(`${COL.bueno}${fila}`).value = '';
        worksheet.getCell(`${COL.malo}${fila}`).value = '';
        worksheet.getCell(`${COL.na}${fila}`).value = '';

        const valor = String(respuesta.value ?? '')
          .toLowerCase()
          .trim();
        if (valor === 'bueno' || valor === 'true') {
          worksheet.getCell(`${COL.bueno}${fila}`).value = 'X';
        } else if (valor === 'malo' || valor === 'false') {
          worksheet.getCell(`${COL.malo}${fila}`).value = 'X';
        } else if (valor === 'na' || valor === 'n/a') {
          worksheet.getCell(`${COL.na}${fila}`).value = 'X';
        } else if (valor) {
          this.logger.warn(
            `Valor no reconocido en section_${indiceSeccion}.q${indicePregunta}: "${valor}"`,
          );
        }

        const observacion = respuesta.observacion?.trim();
        if (observacion) {
          const numero = this.texto(worksheet.getCell(`A${fila}`).value);
          observacionesSueltas.push(`${numero}. ${observacion}`);
        }
      });
    });

    return observacionesSueltas;
  }

  /** Reparte el texto en las filas libres del bloque de observaciones. */
  private llenarObservaciones(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
    observacionesPorPregunta: string[],
    filaObservaciones: number,
    filaFirma: number,
  ): void {
    if (!filaObservaciones) return;

    const partes: string[] = [];
    const general = inspection.generalObservations?.trim();
    if (general) partes.push(general);
    partes.push(...observacionesPorPregunta);
    if (!partes.length) return;

    // La firma va dentro de su propia fila (`AE:AJ`), así que las líneas de
    // observación pueden ocupar todo el hueco hasta el rótulo.
    const ultimaFila = filaFirma ? filaFirma - 1 : worksheet.rowCount;
    const disponibles = Math.max(1, ultimaFila - filaObservaciones);

    const lineas = partes.flatMap((p) => p.split(/\r?\n/)).filter(Boolean);
    const ajustadas =
      lineas.length <= disponibles
        ? lineas
        : [
            ...lineas.slice(0, disponibles - 1),
            lineas.slice(disponibles - 1).join(' · '),
          ];

    ajustadas.forEach((linea, i) => {
      const celda = worksheet.getCell(`A${filaObservaciones + 1 + i}`);
      celda.value = linea;
      celda.alignment = { ...celda.alignment, wrapText: true, vertical: 'top' };
    });
  }

  private async llenarFirma(
    worksheet: ExcelJS.Worksheet,
    inspection: InspectionHerraEquipos,
    filaFirma: number,
  ): Promise<void> {
    const firma = inspection.inspectorSignature?.inspectorSignature;
    if (
      !filaFirma ||
      typeof firma !== 'string' ||
      !firma.startsWith('data:image/')
    ) {
      return;
    }

    try {
      const base64 = firma.replace(/^data:image\/\w+;base64,/, '');
      const buffer = (await resizeImageBuffer(
        Buffer.from(base64, 'base64'),
      )) as unknown as ExcelJS.Buffer;

      const imageId = worksheet.workbook.addImage({
        buffer,
        extension: 'jpeg',
      });

      // Dentro del recuadro `AE:AJ` de la fila del rótulo, no encima de él.
      const { FIRMA } = ExcelInspeccionFrecuenteService;
      const desde = this.coordenadas(`${FIRMA.desde}1`).col;
      const hasta = this.coordenadas(`${FIRMA.hasta}1`).col;
      worksheet.addImage(imageId, {
        tl: { col: desde - 1, row: filaFirma - 1 } as ExcelJS.Anchor,
        br: { col: hasta, row: filaFirma } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });
    } catch (error) {
      // Una firma ilegible no debe impedir la descarga del reporte completo.
      this.logger.error(`No se pudo insertar la firma: ${error.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Entrada pública
  // ────────────────────────────────────────────────────────────────

  async generateExcel(inspection: InspectionHerraEquipos): Promise<Buffer> {
    const codigo = String(inspection.templateCode ?? '').toUpperCase();
    const archivo = this.getSupportedTemplateCodes()
      .filter((code) => codigo.includes(code))
      .map((code) => ExcelInspeccionFrecuenteService.PLANTILLAS[code])[0];

    if (!archivo) {
      throw new Error(
        `No hay plantilla de inspección frecuente para el código '${inspection.templateCode}'`,
      );
    }

    const rutaPlantilla = path.join(process.cwd(), 'src', 'templates', archivo);
    if (!fs.existsSync(rutaPlantilla)) {
      throw new Error(`No existe la plantilla Excel: ${rutaPlantilla}`);
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(rutaPlantilla);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error(`La plantilla '${archivo}' no tiene hojas`);
      }

      const { secciones, filaObservaciones, filaFirma } =
        this.derivarLayout(worksheet);

      this.logger.log(
        `${inspection.templateCode}: ${secciones.length} secciones, ` +
          `${secciones.reduce((n, s) => n + s.filas.length, 0)} preguntas ` +
          `(observaciones fila ${filaObservaciones}, firma fila ${filaFirma})`,
      );

      this.llenarCabecera(worksheet, inspection);
      const sueltas = this.llenarRespuestas(worksheet, inspection, secciones);
      this.llenarObservaciones(
        worksheet,
        inspection,
        sueltas,
        filaObservaciones,
        filaFirma,
      );
      await this.llenarFirma(worksheet, inspection, filaFirma);

      return Buffer.from(await workbook.xlsx.writeBuffer());
    } catch (error) {
      this.logger.error(
        `Error generando Excel de ${inspection.templateCode}: ${error.message}`,
      );
      throw new Error(
        `Error al generar el Excel de inspección frecuente: ${error.message}`,
      );
    }
  }
}
