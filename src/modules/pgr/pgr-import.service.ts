import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CreatePgrDto, ProgramacionMesDto } from './dto/create-pgr.dto';

/**
 * Importador del PGR desde la planilla oficial (1.02.P06.F29).
 *
 * ⚠️ Lee SIEMPRE la hoja `Programa Gestión`, nunca `pgr_`.
 * La hoja plana `pgr_` parece ideal (55 columnas ya normalizadas con
 * cabeceras nombradas) pero está desactualizada: en el archivo de referencia
 * solo trae 8 de las 50 actividades. Importar desde ahí perdería 42 filas
 * sin emitir ningún error.
 *
 * Las 12 hojas mensuales (`Ene`…`Dic`) y `gestion` se ignoran: son vistas
 * derivadas de la maestra, no datos nuevos.
 *
 * Los KPIs del Excel tampoco se importan — se recalculan con
 * `domain/pgr-kpi.util.ts`.
 */

/** Layout de la planilla. Si cambia la revisión del formulario, ajustar aquí. */
const LAYOUT = {
  hoja: 'Programa Gestión',
  filaPrimeraActividad: 9,
  filaUltimaActividad: 920,
  /** Cada actividad ocupa 2 filas: `Prog.` y `Real`. */
  filasPorActividad: 2,
  col: {
    tipoFila: 7, // G — "Prog." | "Real"
    verificador: 2, // B
    actividad: 3, // C
    responsable: 4, // D
    recursos: 5, // E
    entregable: 6, // F
    historial: 52, // AZ
    /** Primera columna de calendario (Ene). 12 meses × 3 sub-columnas. */
    calendarioInicio: 8, // H
  },
  cabecera: {
    vicepresidencia: { r: 4, c: 3 },
    gerencia: { r: 5, c: 3 },
    superintendencia: { r: 6, c: 3 },
    empresa: { r: 6, c: 5 },
    gestion: { r: 6, c: 41 },
    aprobadoPor: { r: 4, c: 47 },
    codigoExterno: { r: 6, c: 47 },
    mesCorte: { r: 4, c: 10 }, // $J$4
    ventanaGestion: { r: 4, c: 23 }, // $W$4
  },
} as const;

export interface ResumenImportacion {
  pgr: CreatePgrDto;
  actividadesLeidas: number;
  actividadesImportadas: number;
  verificadores: number;
  /** Filas descartadas y el motivo — nunca se descarta en silencio. */
  omitidas: Array<{ fila: number; motivo: string }>;
  advertencias: string[];
  /** URLs encontradas como hipervínculo en celdas de ejecución. */
  evidenciasDetectadas: number;
}

@Injectable()
export class PgrImportService {
  private readonly logger = new Logger(PgrImportService.name);

  /**
   * Texto de una celda, resolviendo los tipos que ExcelJS puede devolver:
   * richText, fórmulas con resultado cacheado, e hipervínculos.
   */
  /**
   * Una celda de texto a lista. Es la inversa de lo que hace el exportador,
   * que junta las listas con salto de línea para que entren en la única celda
   * que el formulario prevé.
   */
  private lineas(valor: ExcelJS.CellValue): string[] {
    return this.texto(valor)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /**
   * `"2 HH"` → `{ cantidad: 2, unidad: 'HH' }`.
   *
   * Devuelve `null` cuando la celda no tiene esa forma —los archivos viejos
   * traen texto libre— y el llamador la descarta: mejor perder un recurso mal
   * escrito que guardar `NaN` y arruinar la suma de esfuerzo.
   */
  private parsearRecurso(
    texto: string,
  ): { cantidad: number; unidad: string } | null {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.+?)\s*$/.exec(texto);
    if (!m) return null;
    const cantidad = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(cantidad)) return null;
    return { cantidad, unidad: m[2] };
  }

  private texto(valor: ExcelJS.CellValue): string {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'object') {
      const v = valor as unknown as Record<string, unknown>;
      if (Array.isArray(v.richText)) {
        return (v.richText as Array<{ text: string }>)
          .map((t) => t.text)
          .join('')
          .trim();
      }
      const escalar = (x: unknown): string | null =>
        typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
          ? String(x).trim()
          : null;

      return escalar(v.text) ?? escalar(v.result) ?? '';
    }
    return String(valor).trim();
  }

  /**
   * Número de una celda.
   *
   * ⚠️ Contempla celdas con hipervínculo: en el archivo de referencia, tres
   * celdas de ejecución vienen como `{ text: 1, hyperlink: 'https://…' }`
   * porque el usuario adjuntó la evidencia sobre la cantidad. Leerlas como
   * `0` descuadraba los indicadores — era la causa de que el total no
   * coincidiera con el del documento.
   */
  private numero(valor: ExcelJS.CellValue): number {
    if (valor === null || valor === undefined) return 0;
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'object') {
      const v = valor as unknown as Record<string, unknown>;
      const crudo = v.text ?? v.result ?? null;
      const n = Number(crudo);
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** Hipervínculo de una celda, si lo tiene (se usa como evidencia). */
  private hipervinculo(valor: ExcelJS.CellValue): string | null {
    if (valor && typeof valor === 'object') {
      const h = (valor as unknown as Record<string, unknown>).hyperlink;
      if (typeof h === 'string' && h.length > 0) return h;
    }
    return null;
  }

  /**
   * Normaliza los nombres de la cabecera.
   *
   * En la planilla vienen como `SUPERINTENDENCIA_DE_MANTENIMIENTO_ELÉCTRICO_E_INSTRUMENTACIÓN`:
   * con guiones bajos en vez de espacios. `PgrService.resolverAreas()` busca
   * por regex exacta contra el catálogo, así que sin esta normalización lanza
   * `BadRequestException` y **falla la importación entera**.
   */
  private normalizarNombre(valor: string): string {
    return valor.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async parsear(buffer: Buffer): Promise<ResumenImportacion> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException(
        'El archivo no se pudo leer como Excel (.xlsx) válido.',
      );
    }

    const ws = wb.getWorksheet(LAYOUT.hoja);
    if (!ws) {
      const hojas = wb.worksheets.map((w) => w.name).join(', ');
      throw new BadRequestException(
        `No se encontró la hoja "${LAYOUT.hoja}". Hojas disponibles: ${hojas}`,
      );
    }

    const advertencias: string[] = [];
    const omitidas: ResumenImportacion['omitidas'] = [];
    const celda = (r: number, c: number) => ws.getRow(r).getCell(c).value;

    // ── Cabecera ──────────────────────────────────────────────────────────
    const h = LAYOUT.cabecera;
    const superintendencia = this.normalizarNombre(
      this.texto(celda(h.superintendencia.r, h.superintendencia.c)),
    );
    if (!superintendencia) {
      throw new BadRequestException(
        'La planilla no tiene superintendencia en la cabecera; no se puede importar.',
      );
    }

    const mesCorte = this.numero(celda(h.mesCorte.r, h.mesCorte.c)) || 12;
    const ventanaGestion =
      this.numero(celda(h.ventanaGestion.r, h.ventanaGestion.c)) || 12;

    if (ventanaGestion < mesCorte) {
      advertencias.push(
        `La ventana de gestión (${ventanaGestion}) es menor que el mes de corte (${mesCorte}). ` +
          'Se importó tal cual está en la planilla; conviene revisarlo.',
      );
    }

    // ── Actividades ───────────────────────────────────────────────────────
    const actividades: CreatePgrDto['actividades'] = [];
    const verificadores = new Set<string>();
    let evidenciasDetectadas = 0;
    let leidas = 0;

    for (
      let r = LAYOUT.filaPrimeraActividad;
      r <= LAYOUT.filaUltimaActividad;
      r += LAYOUT.filasPorActividad
    ) {
      const descripcion = this.texto(celda(r, LAYOUT.col.actividad));
      if (!descripcion) continue;
      leidas++;

      // Verifica que el par de filas sea realmente Prog. / Real
      const tipoProg = this.texto(celda(r, LAYOUT.col.tipoFila));
      const tipoReal = this.texto(celda(r + 1, LAYOUT.col.tipoFila));
      if (!/prog/i.test(tipoProg) || !/real/i.test(tipoReal)) {
        omitidas.push({
          fila: r,
          motivo: `Se esperaba el par Prog./Real y se encontró "${tipoProg}"/"${tipoReal}"`,
        });
        continue;
      }

      const programacion: ProgramacionMesDto[] = [];
      const evidencias: string[] = [];

      for (let m = 0; m < 12; m++) {
        const base = LAYOUT.col.calendarioInicio + m * 3;

        // `Prog.` es una celda combinada: las 3 sub-columnas devuelven el
        // mismo valor, así que basta leer la primera.
        const programado = this.numero(celda(r, base));

        const realMesPasado = this.numero(celda(r + 1, base));
        const realDelMes = this.numero(celda(r + 1, base + 1));
        const realMesAdelantado = this.numero(celda(r + 1, base + 2));

        for (const off of [0, 1, 2]) {
          const link = this.hipervinculo(celda(r + 1, base + off));
          if (link) {
            evidencias.push(link);
            evidenciasDetectadas++;
          }
        }

        if (
          programado > 0 ||
          realMesPasado > 0 ||
          realDelMes > 0 ||
          realMesAdelantado > 0
        ) {
          programacion.push({
            mes: m + 1,
            programado,
            realMesPasado,
            realDelMes,
            realMesAdelantado,
          });
        }
      }

      const verificador = this.texto(celda(r, LAYOUT.col.verificador));
      if (verificador) verificadores.add(verificador);

      actividades.push({
        descripcion,
        verificador,
        // Las tres celdas son texto en el formulario y listas en el modelo:
        // se parten por salto de línea, que es como las escribe el exportador.
        // El alcance por área no se lee de acá — el formulario no lo tiene.
        responsables: this.lineas(celda(r, LAYOUT.col.responsable)).map(
          (nombre) => ({
            tipo: 'trabajador' as const,
            referencia: nombre,
            nombre,
          }),
        ),
        recursos: this.lineas(celda(r, LAYOUT.col.recursos))
          .map((t) => this.parsearRecurso(t))
          .filter((r): r is { cantidad: number; unidad: string } => r !== null),
        entregables: this.lineas(celda(r, LAYOUT.col.entregable)),
        historialTrazabilidad:
          this.texto(celda(r, LAYOUT.col.historial)) || undefined,
        programacion,
        ...(evidencias.length > 0 ? { evidencias } : {}),
      });
    }

    if (actividades.length === 0) {
      throw new BadRequestException(
        'No se encontró ninguna actividad en la hoja "Programa Gestión". ' +
          'Verificá que el archivo corresponda al formulario 1.02.P06.F29.',
      );
    }

    const pgr: CreatePgrDto = {
      empresa: this.texto(celda(h.empresa.r, h.empresa.c)),
      vicepresidencia: this.normalizarNombre(
        this.texto(celda(h.vicepresidencia.r, h.vicepresidencia.c)),
      ),
      gerencia: this.normalizarNombre(
        this.texto(celda(h.gerencia.r, h.gerencia.c)),
      ),
      superintendencia,
      gestion:
        this.texto(celda(h.gestion.r, h.gestion.c)) ||
        String(new Date().getFullYear()),
      codigoExterno:
        this.texto(celda(h.codigoExterno.r, h.codigoExterno.c)) || undefined,
      mesCorte,
      ventanaGestion,
      actividades,
    };

    this.logger.log(
      `Import PGR: ${actividades.length} actividades, ${verificadores.size} verificadores, ` +
        `${evidenciasDetectadas} evidencias, ${omitidas.length} omitidas`,
    );

    return {
      pgr,
      actividadesLeidas: leidas,
      actividadesImportadas: actividades.length,
      verificadores: verificadores.size,
      omitidas,
      advertencias,
      evidenciasDetectadas,
    };
  }
}
