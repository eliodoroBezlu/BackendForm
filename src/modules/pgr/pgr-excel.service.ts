import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Pgr, MESES_PGR } from './schemas/pgr.schema';
import {
  calcularIndicadores,
  calcularIndicadoresPgr,
  ProgramacionMesLike,
} from './domain/pgr-kpi.util';

/**
 * Genera el PGR en el formato de la planilla oficial (1.02.P06.F29).
 *
 * Reproduce la estructura del documento real:
 *   - cabecera con vicepresidencia / gerencia / superintendencia / gestión
 *   - una fila `Prog.` y otra `Real` por actividad
 *   - 12 meses × 3 sub-columnas, con los colores de las categorías de
 *     oportunidad (rojo = con retraso, blanco = a tiempo, verde = adelantado)
 *   - indicadores calculados, no copiados
 *
 * Solo se genera la hoja maestra. Las 12 hojas mensuales del documento
 * original son vistas derivadas de esta misma matriz; si hicieran falta se
 * pueden añadir después sin tocar el modelo.
 */

/** Colores exactos de la planilla original. */
const RELLENO = {
  mesPasado: 'FFD99594', // rojo  — con retraso
  delMes: 'FFFFFFFF', // blanco — a tiempo
  mesAdelantado: 'FFEAF1DD', // verde — adelantado
  cabecera: 'FFFCD5B4',
  subCabecera: 'FFF2F2F2',
} as const;

/**
 * Columnas — deben coincidir con las que lee `PgrImportService`, para que un
 * archivo exportado se pueda volver a importar sin pérdida (round-trip).
 * Es el mismo layout de la planilla original.
 */
const COL = {
  verificador: 2, // B
  actividad: 3, // C
  responsable: 4, // D
  recursos: 5, // E
  entregable: 6, // F
  tipoFila: 7, // G — "Prog." | "Real"
  /** Primera columna de calendario (Ene). */
  calendario: 8, // H
} as const;

/** Celdas de cabecera, en las mismas posiciones que espera el importador. */
const CABECERA = {
  vicepresidencia: { r: 4, c: 3 },
  gerencia: { r: 5, c: 3 },
  superintendencia: { r: 6, c: 3 },
  empresa: { r: 6, c: 5 },
  gestion: { r: 6, c: 41 },
  aprobadoPor: { r: 4, c: 47 },
  codigoExterno: { r: 6, c: 47 },
  mesCorte: { r: 4, c: 10 }, // $J$4
  ventanaGestion: { r: 4, c: 23 }, // $W$4
} as const;

/** Tras las 36 columnas de calendario vienen los indicadores. */
const COL_KPI = COL.calendario + 36;

@Injectable()
export class PgrExcelService {
  private rellenar(cell: ExcelJS.Cell, argb: string) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb },
    };
  }

  private bordear(cell: ExcelJS.Cell) {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  }

  async generar(pgr: Pgr): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema de Inspecciones — MSC';
    wb.created = new Date();

    const ws = wb.addWorksheet('Programa Gestión', {
      views: [{ state: 'frozen', xSplit: 6, ySplit: 8 }],
    });

    const mesCorte = pgr.mesCorte ?? 12;
    const ventana = pgr.ventanaGestion ?? 12;
    const actividades = pgr.actividades ?? [];

    // ── Cabecera ──────────────────────────────────────────────────────────
    ws.getCell(1, 1).value = 'PROGRAMA DE GESTIÓN DE RIESGOS';
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, 10);

    // Cabecera en las mismas celdas que lee el importador, para que el
    // archivo generado se pueda volver a importar.
    const meta: Array<[{ r: number; c: number }, string, string]> = [
      [CABECERA.vicepresidencia, 'Vicepresidencia:', pgr.vicepresidencia],
      [CABECERA.gerencia, 'Gerencia:', pgr.gerencia],
      [CABECERA.superintendencia, 'Superintendencia:', pgr.superintendencia],
      [CABECERA.empresa, 'Empresa:', pgr.empresa],
      [CABECERA.gestion, 'Gestión:', pgr.gestion],
      [
        CABECERA.codigoExterno,
        'Código:',
        pgr.codigoExterno || pgr.codigoAutogenerado,
      ],
      [CABECERA.aprobadoPor, 'Aprobado por:', pgr.aprobadoPor || '—'],
    ];
    meta.forEach(([pos, etiqueta, valor]) => {
      const label = ws.getCell(pos.r, pos.c - 1);
      label.value = etiqueta;
      label.font = { bold: true, size: 9 };
      const cell = ws.getCell(pos.r, pos.c);
      cell.value = valor;
      cell.font = { size: 9 };
    });

    // Celdas de control ($J$4 y $W$4 en la planilla original).
    ws.getCell(CABECERA.mesCorte.r, CABECERA.mesCorte.c).value = mesCorte;
    ws.getCell(CABECERA.mesCorte.r, CABECERA.mesCorte.c - 1).value =
      'Periodo Mes:';
    ws.getCell(CABECERA.ventanaGestion.r, CABECERA.ventanaGestion.c).value =
      ventana;
    ws.getCell(CABECERA.ventanaGestion.r, CABECERA.ventanaGestion.c - 1).value =
      'Gestión:';

    // ── Leyenda de las 3 categorías ───────────────────────────────────────
    ws.getCell(7, COL.calendario).value = 'Ejecutada mes pasado';
    this.rellenar(ws.getCell(7, COL.calendario), RELLENO.mesPasado);
    ws.getCell(7, COL.calendario + 1).value = 'Ejecutada del mes';
    ws.getCell(7, COL.calendario + 2).value = 'Ejecutada adelantada';
    this.rellenar(ws.getCell(7, COL.calendario + 2), RELLENO.mesAdelantado);

    // ── Fila de encabezados (fila 8, igual que el original) ───────────────
    const cabeceras = [
      'VERIFICADOR',
      'ACTIVIDAD',
      'RESPONSABLE',
      'Recursos (HH $)',
      'Entregable',
      'Prog.',
    ];
    cabeceras.forEach((texto, i) => {
      const cell = ws.getCell(8, COL.verificador + i);
      cell.value = texto;
      cell.font = { bold: true, size: 9 };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      this.rellenar(cell, RELLENO.cabecera);
      this.bordear(cell);
    });

    MESES_PGR.forEach((mes, m) => {
      const base = COL.calendario + m * 3;
      ws.mergeCells(8, base, 8, base + 2);
      const cell = ws.getCell(8, base);
      cell.value = mes;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center' };
      this.rellenar(cell, RELLENO.cabecera);
      this.bordear(cell);
    });

    const kpiCabeceras = [
      'Periodo Eficacia',
      'Periodo Eficiencia',
      'Total Gestión Eficacia',
      'Total Gestión Eficiencia',
      '% Avance Eficacia',
      '% Avance Eficiencia',
      'Historial / Trazabilidad',
    ];
    kpiCabeceras.forEach((texto, i) => {
      const cell = ws.getCell(8, COL_KPI + i);
      cell.value = texto;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', wrapText: true };
      this.rellenar(cell, RELLENO.cabecera);
      this.bordear(cell);
    });

    // ── Actividades: dos filas por cada una ───────────────────────────────
    let fila = 9;
    for (const act of actividades) {
      const filaProg = fila;
      const filaReal = fila + 1;
      const programacion = (act.programacion ?? []) as ProgramacionMesLike[];

      // Los campos de texto abarcan ambas filas, como en el original.
      // Responsables, recursos y entregables son opcionales: una actividad
      // recién consolidada desde la matriz todavía no los tiene. Se exportan
      // vacíos en vez de romper la generación del documento.
      //
      // Son listas en el modelo y una sola celda en el formulario, así que se
      // juntan con salto de línea — el alto de fila del original ya lo tolera.
      // El **alcance por área no se exporta**: el formulario oficial no tiene
      // esa columna y el área se sigue leyendo del texto de la actividad.
      const textos: Array<[number, string]> = [
        [COL.verificador, act.verificador],
        [COL.actividad, act.descripcion],
        [
          COL.responsable,
          (act.responsables ?? []).map((r) => r.nombre).join('\n'),
        ],
        [
          COL.recursos,
          (act.recursos ?? [])
            .map((r) => `${r.cantidad} ${r.unidad}`)
            .join('\n'),
        ],
        [COL.entregable, (act.entregables ?? []).join('\n')],
      ];
      for (const [col, valor] of textos) {
        ws.mergeCells(filaProg, col, filaReal, col);
        const cell = ws.getCell(filaProg, col);
        cell.value = valor;
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        this.bordear(cell);
      }

      ws.getCell(filaProg, COL.tipoFila).value = 'Prog.';
      ws.getCell(filaReal, COL.tipoFila).value = 'Real';
      for (const f of [filaProg, filaReal]) {
        const cell = ws.getCell(f, COL.tipoFila);
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center' };
        this.rellenar(cell, RELLENO.subCabecera);
        this.bordear(cell);
      }

      for (let m = 1; m <= 12; m++) {
        const base = COL.calendario + (m - 1) * 3;
        const p = programacion.find((x) => x.mes === m);

        // `Prog.` combinada en las 3 sub-columnas, igual que el original.
        ws.mergeCells(filaProg, base, filaProg, base + 2);
        const progCell = ws.getCell(filaProg, base);
        progCell.value = p?.programado || 0;
        progCell.alignment = { horizontal: 'center' };
        progCell.font = { size: 9 };
        this.bordear(progCell);

        const reales: Array<[number, number, string]> = [
          [base, p?.realMesPasado ?? 0, RELLENO.mesPasado],
          [base + 1, p?.realDelMes ?? 0, RELLENO.delMes],
          [base + 2, p?.realMesAdelantado ?? 0, RELLENO.mesAdelantado],
        ];
        for (const [col, valor, color] of reales) {
          const cell = ws.getCell(filaReal, col);
          cell.value = valor || null;
          cell.alignment = { horizontal: 'center' };
          cell.font = { size: 9 };
          this.rellenar(cell, color);
          this.bordear(cell);
        }
      }

      // Indicadores recalculados — nunca copiados del documento de origen.
      const periodo = calcularIndicadores(programacion, mesCorte);
      const gestion = calcularIndicadores(programacion, ventana);

      const valores: Array<[number, number | string | null]> = [
        [0, periodo.programado],
        [1, periodo.programado],
        [2, gestion.programado],
        [3, gestion.programado],
        [4, periodo.porcentajeEficacia],
        [5, periodo.porcentajeEficiencia],
        [6, act.historialTrazabilidad || ''],
      ];
      valores.forEach(([offset, valor]) => {
        const cell = ws.getCell(filaProg, COL_KPI + offset);
        cell.value = valor;
        cell.font = { size: 9 };
        if (offset >= 4 && offset <= 5) cell.numFmt = '0.0%';
        this.bordear(cell);
      });

      const realesKpi: Array<[number, number | null]> = [
        [0, periodo.eficacia],
        [1, periodo.eficiencia],
        [2, gestion.eficacia],
        [3, gestion.eficiencia],
      ];
      realesKpi.forEach(([offset, valor]) => {
        const cell = ws.getCell(filaReal, COL_KPI + offset);
        cell.value = valor;
        cell.font = { size: 9 };
        this.bordear(cell);
      });

      fila += 2;
    }

    // ── Totales del PGR ───────────────────────────────────────────────────
    const totales = calcularIndicadoresPgr(actividades, mesCorte, ventana);
    const filaTotales = fila + 1;
    ws.getCell(filaTotales, COL.verificador).value = 'TOTALES';
    ws.getCell(filaTotales, COL.verificador).font = { bold: true };

    const resumen: Array<[number, string, number | null]> = [
      [0, 'Periodo eficacia', totales.periodo.porcentajeEficacia],
      [1, 'Periodo eficiencia', totales.periodo.porcentajeEficiencia],
      [2, 'Gestión eficacia', totales.gestion.porcentajeEficacia],
      [3, 'Gestión eficiencia', totales.gestion.porcentajeEficiencia],
    ];
    resumen.forEach(([offset, etiqueta, valor]) => {
      const label = ws.getCell(filaTotales, COL.actividad + offset);
      label.value = etiqueta;
      label.font = { size: 9, italic: true };
      const cell = ws.getCell(filaTotales, COL_KPI + offset);
      cell.value = valor;
      cell.numFmt = '0.0%';
      cell.font = { bold: true, size: 9 };
      this.bordear(cell);
    });

    // ── Anchos ────────────────────────────────────────────────────────────
    ws.getColumn(COL.verificador).width = 34;
    ws.getColumn(COL.actividad).width = 46;
    ws.getColumn(COL.responsable).width = 26;
    ws.getColumn(COL.recursos).width = 12;
    ws.getColumn(COL.entregable).width = 30;
    ws.getColumn(COL.tipoFila).width = 7;
    for (let c = COL.calendario; c < COL_KPI; c++) ws.getColumn(c).width = 4;
    for (let i = 0; i < kpiCabeceras.length; i++) {
      ws.getColumn(COL_KPI + i).width = 13;
    }

    return wb.xlsx.writeBuffer();
  }
}
