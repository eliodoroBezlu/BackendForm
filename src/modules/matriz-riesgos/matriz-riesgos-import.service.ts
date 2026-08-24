import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  normalizarCategoria,
  normalizarCondicion,
  normalizarNivel,
  requierePgr,
} from './domain/nivel-riesgo';
import { evaluarRiesgoPuro } from './domain/evaluacion-riesgo.util';
import {
  calcularEficaciaDesdeTextos,
  normalizarEficacia,
} from './domain/eficacia-control.util';
import { calcularNivelResidual } from './domain/nivel-residual.util';
import {
  CabeceraAnalizada,
  ControlAnalizado,
  Discrepancia,
  ResultadoAnalisis,
  RiesgoAnalizado,
} from './dto/resultado-importacion';

/** Columnas de la matriz, iguales en todas las revisiones vistas. */
const COL = {
  numero: 'A',
  areaProceso: 'B',
  actividad: 'C',
  condicion: 'D',
  categoria: 'E',
  familiaPeligro: 'F',
  descripcionPeligro: 'G',
  familiaRiesgo: 'H',
  descripcionRiesgo: 'I',
  exposicion: 'J',
  posibilidad: 'K',
  probabilidad: 'L',
  severidad: 'M',
  resultado: 'N',
  nivelInicial: 'O',
  familiaControl: 'P',
  medida: 'Q',
  familiaVerificador: 'R',
  verificador: 'S',
  calidad: 'T',
  jerarquia: 'U',
  eficacia: 'V',
  nivelActual: 'W',
  incidentes: 'X',
  trazabilidad: 'Y',
} as const;

const MESES_ES: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

/**
 * Analiza un Excel de Identificación y Evaluación de Riesgos (1.02.P06.F01).
 *
 * No escribe nada: devuelve los riesgos ya parseados, **recalculados con el
 * motor del dominio** y comparados contra los valores que traía el archivo.
 * La confirmación y el guardado son un paso aparte.
 *
 * ── Por qué nada está anclado a filas fijas ────────────────────────────────
 *
 * La plantilla vacía Rev.7 y las matrices ya llenas **no comparten layout**:
 * en la plantilla la cabecera de la tabla está en las filas 9-10 y los datos
 * empiezan en la 11; en la matriz de Planta Chancado están en 6-7 y 8. Los
 * rótulos también cambian (`Gerencia:` vs `Gerencia / Superintendencia Senior :`).
 * Por eso todo se localiza por contenido: la cabecera se busca por la palabra
 * "Exposición" en la columna J, y los datos del encabezado por su rótulo.
 */
@Injectable()
export class MatrizRiesgosImportService {
  private readonly logger = new Logger(MatrizRiesgosImportService.name);

  // ──────────────────────────────────────────────────────────────────────────
  // Lectura de celdas
  // ──────────────────────────────────────────────────────────────────────────

  /** Texto plano de una celda, aplanando richText, hyperlinks y fórmulas. */
  private texto(valor: ExcelJS.CellValue): string {
    let v: unknown = valor;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.richText)) {
        v = (o.richText as { text: string }[]).map((t) => t.text).join('');
      } else if (o.result !== undefined) {
        v = o.result;
      } else if (o.text !== undefined) {
        v = o.text;
      } else if (o.formula !== undefined) {
        // Fórmula sin resultado cacheado: el archivo nunca se abrió en Excel.
        return '';
      }
    }
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return '';
    return String(v as string | number | boolean)
      .replace(/\s+/g, ' ')
      .trim();
  }

  private celda(ws: ExcelJS.Worksheet, col: string, fila: number): string {
    return this.texto(ws.getCell(`${col}${fila}`).value);
  }

  private numero(
    ws: ExcelJS.Worksheet,
    col: string,
    fila: number,
  ): number | null {
    const t = this.celda(ws, col, fila);
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  private normalizar(s: string): string {
    return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Localización del layout
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fila de la cabecera de la tabla: la que dice "Exposición" en la columna J.
   * Es el único rótulo que aparece una sola vez y siempre en la fila inferior
   * del encabezado de dos niveles.
   */
  private buscarFilaCabecera(ws: ExcelJS.Worksheet): number | null {
    const limite = Math.min(ws.rowCount, 40);
    for (let r = 1; r <= limite; r++) {
      if (
        this.normalizar(this.celda(ws, COL.exposicion, r)).startsWith('EXPOSIC')
      ) {
        return r;
      }
    }
    return null;
  }

  /**
   * Lee los datos del encabezado buscando cada rótulo y tomando el primer
   * valor no vacío a su derecha, en la misma fila.
   */
  private leerCabecera(
    ws: ExcelJS.Worksheet,
    filaCabecera: number,
  ): CabeceraAnalizada {
    const cab: CabeceraAnalizada = {};
    const fechas: string[] = [];

    for (let r = 1; r < filaCabecera; r++) {
      const fila = ws.getRow(r);
      for (let c = 1; c <= 30; c++) {
        const rotulo = this.normalizar(this.texto(fila.getCell(c).value));
        if (!rotulo) continue;

        const valorDerecha = (): string => {
          let anterior = this.texto(fila.getCell(c).value);
          for (let k = c + 1; k <= 40; k++) {
            const v = this.texto(fila.getCell(k).value);
            // Las celdas combinadas repiten el valor: hay que saltarlas.
            if (v && v !== anterior) return v;
            if (v) anterior = v;
          }
          return '';
        };

        // El orden importa: "Gerencia / Superintendencia Senior" empieza por
        // GERENCIA y no debe capturarse como superintendencia.
        if (rotulo.startsWith('GERENCIA')) cab.gerencia ||= valorDerecha();
        else if (rotulo.startsWith('SUPERINTENDENCIA'))
          cab.superintendencia ||= valorDerecha();
        else if (rotulo.startsWith('AREA')) cab.area ||= valorDerecha();
        else if (rotulo.startsWith('ELABORAD'))
          cab.elaboradoPor ||= valorDerecha();
        else if (rotulo.startsWith('REVISADO'))
          cab.revisadoAprobadoPor ||= valorDerecha();
        else if (rotulo.startsWith('FECHA')) {
          const f = valorDerecha();
          if (f) fechas.push(f);
        }
      }
    }

    // Suelen ser dos: elaboración y aprobación, en ese orden.
    if (fechas[0]) cab.fechaElaboracion = fechas[0];
    if (fechas[1]) cab.fechaAprobacion = fechas[1];

    cab.anio =
      this.anioDeTexto(ws.name) ??
      this.anioDeTexto(cab.fechaAprobacion) ??
      this.anioDeTexto(cab.fechaElaboracion);

    return cab;
  }

  /** Extrae un año de 4 dígitos entre 2000 y 2100. */
  private anioDeTexto(texto?: string): number | undefined {
    if (!texto) return undefined;
    const m = /(20\d{2})/.exec(texto);
    return m ? Number(m[1]) : undefined;
  }

  /** `05 / Dic / 2024` → `Date`. Devuelve `undefined` si no reconoce el formato. */
  parsearFecha(texto?: string): Date | undefined {
    if (!texto) return undefined;
    const m = /^(\d{1,2})\s*\/\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*\/\s*(\d{4})$/.exec(
      texto.trim(),
    );
    if (m) {
      const mes = MESES_ES[this.normalizar(m[2]).slice(0, 3)];
      if (mes) return new Date(Number(m[3]), mes - 1, Number(m[1]));
    }
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * Agrupa las filas en bloques de riesgo por el número de la columna A.
   *
   * No se usan las celdas combinadas: un riesgo con **un solo control** no está
   * combinado y quedaría fuera. En la matriz de Planta Chancado eso son 6 de
   * 45 riesgos — justo los que ejercitan la rama de "1 control" del algoritmo.
   */
  private detectarBloques(
    ws: ExcelJS.Worksheet,
    filaCabecera: number,
  ): { numero: number; ini: number; fin: number }[] {
    const bloques: { numero: number; ini: number; fin: number }[] = [];
    let actual: { numero: number; ini: number; fin: number } | null = null;

    for (let r = filaCabecera + 1; r <= ws.rowCount; r++) {
      const a = this.celda(ws, COL.numero, r);
      if (!/^\d+$/.test(a)) continue;
      const numero = Number(a);
      if (!actual || actual.numero !== numero) {
        actual = { numero, ini: r, fin: r };
        bloques.push(actual);
      } else {
        actual.fin = r;
      }
    }
    return bloques;
  }

  /**
   * Elige la hoja de datos: entre las que tienen cabecera, la que **más
   * riesgos** contiene.
   *
   * No alcanza con quedarse con la primera que tenga cabecera. Nueve de las
   * once matrices de Mantenimiento Planta arrastran una hoja extra llamada
   * "MATRIZ DE RIESGOS plantilla" —el formulario en blanco— colocada **antes**
   * de la hoja real, y esa plantilla también tiene la cabecera porque es el
   * mismo formulario. Con la regla anterior el importador leía la plantilla
   * vacía y contestaba "el archivo no contiene riesgos" sobre archivos que
   * tenían entre 28 y 64.
   *
   * Si ninguna hoja tiene filas se devuelve igual la primera con cabecera, para
   * que el usuario lea "no contiene riesgos" —que es lo que pasa— y no el más
   * desorientador "no se encontró la cabecera de la matriz".
   */
  private elegirHoja(wb: ExcelJS.Workbook): {
    ws: ExcelJS.Worksheet;
    filaCabecera: number;
    bloques: { numero: number; ini: number; fin: number }[];
  } | null {
    let mejor: {
      ws: ExcelJS.Worksheet;
      filaCabecera: number;
      bloques: { numero: number; ini: number; fin: number }[];
    } | null = null;

    for (const ws of wb.worksheets) {
      const filaCabecera = this.buscarFilaCabecera(ws);
      if (filaCabecera === null) continue;

      const bloques = this.detectarBloques(ws, filaCabecera);
      if (!mejor || bloques.length > mejor.bloques.length) {
        mejor = { ws, filaCabecera, bloques };
      }
    }

    return mejor;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Análisis
  // ──────────────────────────────────────────────────────────────────────────

  private analizarRiesgo(
    ws: ExcelJS.Worksheet,
    bloque: { numero: number; ini: number; fin: number },
  ): RiesgoAnalizado {
    const { ini, fin, numero } = bloque;
    const advertencias: string[] = [];
    const discrepancias: Discrepancia[] = [];

    // Se guarda la forma del catálogo, no la que traía la celda: `SEGURIDAD` y
    // `Seguridad` son la misma categoría y deben caer en la misma actividad.
    // Lo desconocido se conserva tal cual para que se vea en la previsualización.
    const categoriaExcel = this.celda(ws, COL.categoria, ini);
    const condicionExcel = this.celda(ws, COL.condicion, ini);
    const categoria = normalizarCategoria(categoriaExcel) ?? categoriaExcel;
    const condicion = normalizarCondicion(condicionExcel) ?? condicionExcel;

    if (categoriaExcel && !normalizarCategoria(categoriaExcel)) {
      advertencias.push(`Categoría desconocida: "${categoriaExcel}"`);
    }
    if (condicionExcel && !normalizarCondicion(condicionExcel)) {
      advertencias.push(`Condición desconocida: "${condicionExcel}"`);
    }

    const exposicion = this.numero(ws, COL.exposicion, ini) ?? 0;
    const posibilidad = this.numero(ws, COL.posibilidad, ini) ?? 0;
    const severidad = this.numero(ws, COL.severidad, ini) ?? 0;

    const { probabilidad, resultado, nivelInicial } = evaluarRiesgoPuro({
      exposicion,
      posibilidad,
      severidad,
    });
    if (probabilidad === null) {
      advertencias.push(
        `Evaluación incompleta o fuera de rango (Exp=${exposicion}, Pos=${posibilidad}, Sev=${severidad})`,
      );
    }

    // ── Controles ──────────────────────────────────────────────────────────
    const controles: ControlAnalizado[] = [];
    for (let r = ini; r <= fin; r++) {
      const medida = this.celda(ws, COL.medida, r);
      const calidad = this.celda(ws, COL.calidad, r);
      const jerarquia = this.celda(ws, COL.jerarquia, r);
      if (!medida && !calidad && !jerarquia) continue;

      const eficacia = calcularEficaciaDesdeTextos(jerarquia, calidad);
      const eficaciaExcel = this.celda(ws, COL.eficacia, r) || null;

      if (eficacia === null && (calidad || jerarquia)) {
        advertencias.push(
          `Fila ${r}: no se pudo calcular la eficacia (calidad="${calidad}", jerarquía="${jerarquia}")`,
        );
      }
      const eficaciaExcelNorm = normalizarEficacia(eficaciaExcel);
      if (eficacia && eficaciaExcelNorm && eficacia !== eficaciaExcelNorm) {
        discrepancias.push({
          fila: r,
          campo: 'eficacia',
          enExcel: eficaciaExcelNorm,
          calculado: eficacia,
        });
      }

      const verificador = this.celda(ws, COL.verificador, r);
      if (!verificador) {
        advertencias.push(
          `Fila ${r}: control sin verificador — no será medible desde el PGR`,
        );
      }

      controles.push({
        fila: r,
        familiaControl: this.celda(ws, COL.familiaControl, r),
        medida,
        familiaVerificador:
          this.celda(ws, COL.familiaVerificador, r) || undefined,
        verificador,
        calidadControl: calidad,
        jerarquiaControl: jerarquia,
        eficacia,
        eficaciaExcel,
      });
    }

    const nivelActual = calcularNivelResidual(
      nivelInicial,
      controles.map((c) => c.eficacia),
    );

    // ── Comparación con lo que traía el archivo ────────────────────────────
    const probabilidadExcel = this.numero(ws, COL.probabilidad, ini);
    const resultadoExcel = this.numero(ws, COL.resultado, ini);
    const nivelInicialExcel = this.celda(ws, COL.nivelInicial, ini) || null;
    const nivelActualExcel = this.celda(ws, COL.nivelActual, ini) || null;

    const comparar = (
      campo: Discrepancia['campo'],
      enExcel: string | number | null,
      calculado: string | number | null,
    ) => {
      if (enExcel === null || calculado === null) return;
      if (enExcel !== calculado) {
        discrepancias.push({ fila: ini, campo, enExcel, calculado });
      }
    };

    comparar('probabilidad', probabilidadExcel, probabilidad);
    comparar('resultado', resultadoExcel, resultado);
    comparar('nivelInicial', normalizarNivel(nivelInicialExcel), nivelInicial);
    comparar('nivelActual', normalizarNivel(nivelActualExcel), nivelActual);

    return {
      fila: ini,
      numero,
      areaProcesoAlcance: this.celda(ws, COL.areaProceso, ini),
      actividadTarea: this.celda(ws, COL.actividad, ini),
      condicion,
      categoria,
      familiaPeligro: this.celda(ws, COL.familiaPeligro, ini),
      descripcionPeligro: this.celda(ws, COL.descripcionPeligro, ini),
      familiaRiesgo: this.celda(ws, COL.familiaRiesgo, ini),
      descripcionRiesgo: this.celda(ws, COL.descripcionRiesgo, ini),
      exposicion,
      posibilidad,
      severidad,
      probabilidad,
      resultado,
      nivelInicial,
      nivelActual,
      probabilidadExcel,
      resultadoExcel,
      nivelInicialExcel,
      nivelActualExcel,
      controles,
      requierePgr: nivelActual !== null && requierePgr(nivelActual),
      discrepancias,
      advertencias,
    };
  }

  /**
   * Punto de entrada: analiza el archivo y devuelve todo lo necesario para la
   * pantalla de previsualización. **No escribe en la base.**
   */
  async analizar(
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<ResultadoAnalisis> {
    const errores: string[] = [];
    const advertencias: string[] = [];

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    // La hoja de datos no siempre se llama igual ("MATRIZ DE RIESGOS",
    // "MATRIZ DE RIESGOS_2024", …) ni es la primera del libro.
    const elegida = this.elegirHoja(wb);

    if (!elegida) {
      return {
        archivo: nombreArchivo,
        hoja: '',
        cabecera: {},
        riesgos: [],
        resumen: this.resumir([]),
        errores: [
          'No se encontró la cabecera de la matriz. ¿Es un formulario 1.02.P06.F01?',
        ],
        advertencias,
      };
    }

    const { ws, filaCabecera, bloques } = elegida;

    const cabecera = this.leerCabecera(ws, filaCabecera);
    if (!cabecera.area) errores.push('No se pudo leer el Área/Departamento.');
    if (!cabecera.superintendencia) {
      errores.push('No se pudo leer la Superintendencia.');
    }
    if (!cabecera.anio) {
      advertencias.push(
        'No se pudo deducir el año; habrá que indicarlo al confirmar.',
      );
    }

    if (bloques.length === 0) {
      errores.push('El archivo no contiene riesgos.');
    }

    const riesgos = bloques.map((b) => this.analizarRiesgo(ws, b));

    this.logger.log(
      `${nombreArchivo}: ${riesgos.length} riesgos, ` +
        `${riesgos.reduce((n, r) => n + r.controles.length, 0)} controles, ` +
        `${riesgos.reduce((n, r) => n + r.discrepancias.length, 0)} discrepancias`,
    );

    return {
      archivo: nombreArchivo,
      hoja: ws.name,
      cabecera,
      riesgos,
      resumen: this.resumir(riesgos),
      errores,
      advertencias,
    };
  }

  private resumir(riesgos: RiesgoAnalizado[]) {
    const porNivel: Record<string, number> = {};
    for (const r of riesgos) {
      const k = r.nivelActual ?? '(sin calcular)';
      porNivel[k] = (porNivel[k] ?? 0) + 1;
    }
    return {
      totalRiesgos: riesgos.length,
      totalControles: riesgos.reduce((n, r) => n + r.controles.length, 0),
      riesgosConDiscrepancias: riesgos.filter((r) => r.discrepancias.length > 0)
        .length,
      totalDiscrepancias: riesgos.reduce(
        (n, r) => n + r.discrepancias.length,
        0,
      ),
      porNivel,
      requierenPgr: riesgos.filter((r) => r.requierePgr).length,
      categorias: [...new Set(riesgos.map((r) => r.categoria).filter(Boolean))],
    };
  }
}
