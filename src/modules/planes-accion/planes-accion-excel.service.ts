import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PlanDeAccion, TareaObservacion } from './schemas/plan-accion.schema';
import { resizeImageBuffer } from '../../common/utils/image-resize.util';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

/**
 * Rellena la plantilla oficial "1.02.P06.F41 Planilla de Seguimientos" con
 * los datos de un Plan de Acción.
 *
 * - Columna P (estado) de cada fila ya es fórmula en la plantilla — no se
 *   escribe. Columna O (días de retraso) SÍ se escribe explícitamente con
 *   la misma fórmula que usa el resto de la plantilla: las filas 12-16 de
 *   la plantilla oficial vienen sin esa fórmula (defecto de la plantilla,
 *   verificado contra el archivo original — recién aparece desde la fila
 *   17), así que confiar en lo que ya trae la plantilla deja esas filas sin
 *   calcular. Como ExcelJS no evalúa fórmulas, además se marca
 *   `calcProperties.fullCalcOnLoad` para que Excel recalcule todo al abrir
 *   el archivo (si no, se ven en blanco hasta que el usuario fuerza un F9).
 * - Columna L (evidencia de cierre): si la evidencia es una imagen, se
 *   incrusta la imagen real (la fila/columna de la plantilla ya viene con
 *   tamaño pensado para una foto — 83pt de alto / 140pt de ancho); si no es
 *   imagen (PDF, Word, etc.) se deja el nombre de archivo como texto, ya que
 *   no se puede incrustar como imagen.
 * - El resumen K8/L8 (Tareas Abiertas/Cerradas) SÍ se sobreescribe con los
 *   totales ya calculados del plan en vez de dejar el COUNTIF original de la
 *   plantilla: ese COUNTIF cuenta todo el rango P12:P129, y las filas de
 *   plantilla sin usar también evalúan su fórmula P a "Abierto" (N vacío),
 *   inflando el conteo. M8 (=K8+L8) y O7 (=L8/M8) quedan como fórmula, ya
 *   que dependen correctamente de K8/L8.
 *
 * La plantilla trae capacidad de fórmulas por fila para 118 tareas (filas
 * 12-129); un plan con más tareas que eso simplemente pierde el formato de
 * fórmula de las filas excedentes (caso extremo, no bloquea la exportación).
 */
@Injectable()
export class PlanesAccionExcelService {
  private readonly logger = new Logger(PlanesAccionExcelService.name);
  private readonly templatePath = path.join(
    process.cwd(),
    'src',
    'templates',
    'Planilla_Seguimientos.xlsx',
  );

  private static readonly PRIMERA_FILA_DATOS = 12;
  private static readonly ULTIMA_FILA_CON_FORMULA = 129;
  private static readonly MAX_IMAGENES_POR_FILA = 3;

  async generarExcel(plan: PlanDeAccion): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);
    // ExcelJS no evalúa fórmulas — sin esto, Excel muestra en blanco los
    // días de retraso / estado hasta que el usuario fuerza un recálculo.
    workbook.calcProperties.fullCalcOnLoad = true;

    const worksheet = workbook.getWorksheet('Planilla de Seguimiento');
    if (!worksheet) {
      throw new Error(
        'La plantilla no contiene la hoja "Planilla de Seguimiento"',
      );
    }

    worksheet.getCell('E6').value = plan.vicepresidencia ?? '';
    worksheet.getCell('E7').value = plan.superintendenciaSenior ?? '';
    worksheet.getCell('E8').value = plan.superintendencia ?? '';
    worksheet.getCell('E9').value = plan.areaFisica ?? '';

    worksheet.getCell('K8').value =
      (plan.tareasAbiertas ?? 0) + (plan.tareasEnProgreso ?? 0);
    worksheet.getCell('L8').value = plan.tareasCerradas ?? 0;

    const tareas = (plan.tareas || []).filter(
      (t) => (t as unknown as { activo?: boolean }).activo !== false,
    );

    if (
      tareas.length >
      PlanesAccionExcelService.ULTIMA_FILA_CON_FORMULA -
        PlanesAccionExcelService.PRIMERA_FILA_DATOS +
        1
    ) {
      this.logger.warn(
        `Plan ${String((plan as unknown as { _id?: string })._id)} tiene ${tareas.length} tareas — supera la capacidad de fórmulas de la plantilla (118); el resumen K7:M8 no contará las filas excedentes.`,
      );
    }

    for (let index = 0; index < tareas.length; index++) {
      const fila = PlanesAccionExcelService.PRIMERA_FILA_DATOS + index;
      const row = worksheet.getRow(fila);
      this.llenarFilaTarea(row, tareas[index], index + 1);
      await this.insertarEvidencias(worksheet, fila, tareas[index]);
      row.commit();
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private llenarFilaTarea(
    row: ExcelJS.Row,
    tarea: TareaObservacion,
    numeroItem: number,
  ) {
    row.getCell('A').value = numeroItem;
    row.getCell('B').value = tarea.fechaHallazgo
      ? new Date(tarea.fechaHallazgo)
      : null;
    row.getCell('C').value = tarea.responsableObservacion ?? '';
    row.getCell('D').value = tarea.empresa ?? '';
    row.getCell('E').value = tarea.lugarFisico ?? '';
    row.getCell('F').value = tarea.actividad ?? '';
    row.getCell('G').value = tarea.familiaPeligro ?? '';
    row.getCell('H').value = tarea.descripcionObservacion ?? '';
    row.getCell('I').value = tarea.accionPropuesta ?? '';
    row.getCell('J').value = tarea.responsableAreaCierre ?? '';
    // K (foto "antes") no tiene equivalente en el modelo actual — las
    // evidencias que se suben son las de cierre, van en L.
    row.getCell('M').value = tarea.fechaCumplimientoAcordada
      ? new Date(tarea.fechaCumplimientoAcordada)
      : null;
    row.getCell('N').value = tarea.fechaCumplimientoEfectiva
      ? new Date(tarea.fechaCumplimientoEfectiva)
      : null;
    // P (estado) queda con la fórmula original de la plantilla. O (días de
    // retraso) se fuerza explícitamente — ver comentario de clase.
    const fila = row.number;
    row.getCell('O').value = {
      formula: `IF(M${fila}<>0,IF(P${fila}="Abierto",TODAY()-M${fila},N${fila}-M${fila}),"")`,
    };
  }

  /**
   * Incrusta las evidencias de la tarea en la celda L de su fila: las que
   * son imagen se insertan como imagen real (repartidas en el ancho de la
   * columna si hay más de una); las que no, quedan como texto con el
   * nombre de archivo porque no se pueden incrustar como imagen.
   */
  private async insertarEvidencias(
    worksheet: ExcelJS.Worksheet,
    fila: number,
    tarea: TareaObservacion,
  ) {
    const evidencias = tarea.evidencias || [];
    if (evidencias.length === 0) return;

    const imagenes: Buffer[] = [];
    const otrosNombres: string[] = [];

    for (const evidencia of evidencias) {
      const ext = path.extname(evidencia.url || evidencia.nombre).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        otrosNombres.push(evidencia.nombre);
        continue;
      }

      try {
        const filePath = path.join(process.cwd(), evidencia.url);
        const buffer = await fs.promises.readFile(filePath);
        imagenes.push(await resizeImageBuffer(buffer));
      } catch (error) {
        this.logger.warn(
          `No se pudo leer la evidencia "${evidencia.nombre}" (${evidencia.url}) para la fila ${fila}: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        );
        otrosNombres.push(evidencia.nombre);
      }
    }

    // Celda L (col 12, índice 0-based = 11) — reparte hasta 3 imágenes en
    // franjas horizontales dentro del ancho de la columna.
    const colL = 11;
    const usables = imagenes.slice(
      0,
      PlanesAccionExcelService.MAX_IMAGENES_POR_FILA,
    );
    const anchoFraccion = 1 / usables.length;

    usables.forEach((buffer, i) => {
      const imageId = worksheet.workbook.addImage({
        buffer: buffer as unknown as ExcelJS.Buffer,
        extension: 'jpeg',
      });
      worksheet.addImage(imageId, {
        tl: { col: colL + i * anchoFraccion, row: fila - 1 } as ExcelJS.Anchor,
        br: {
          col: colL + (i + 1) * anchoFraccion,
          row: fila,
        } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });
    });

    if (imagenes.length > usables.length) {
      otrosNombres.push(`+${imagenes.length - usables.length} imagen(es) más`);
    }

    if (otrosNombres.length > 0) {
      worksheet.getCell(fila, colL + 1).value = otrosNombres.join(', ');
    }
  }
}
