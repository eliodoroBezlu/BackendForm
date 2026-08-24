import * as ExcelJS from 'exceljs';
import { resizeImageBuffer } from '../../../../common/utils/image-resize.util';
import { coordenadasDeCelda } from './celdas.util';

/**
 * Inserción de firmas y fotos en una hoja de Excel.
 *
 * El cuerpo de esta operación estaba repetido en 15 generadores, con tres
 * variantes que solo se diferenciaban en detalles (si ajustaban el alto de la
 * fila, si la imagen ocupaba parte de la celda, si abarcaba un rango). Aquí se
 * unifica el trabajo; **el manejo de errores se queda en cada generador**,
 * porque no todos quieren lo mismo: la mayoría propaga el fallo, pero el de
 * arnés lo registra y sigue para no tumbar el reporte entero por una firma.
 */

export interface OpcionesDeImagen {
  /**
   * Qué parte del alto de la fila ocupa la imagen. 1 = la fila completa.
   * Valores menores dejan la imagen «flotando» dentro de la celda.
   */
  proporcionAlto?: number;

  /**
   * Alto que se fija a la fila de destino. Si se omite, la fila no se toca.
   */
  altoDeFila?: number;

  /**
   * Celda final cuando la imagen debe abarcar un rango («H71» → «L85»).
   * Tiene prioridad sobre `proporcionAlto`.
   */
  celdaFinal?: string;
}

/**
 * Coloca una imagen en base64 sobre una celda.
 *
 * La imagen se reescala antes de insertarla (ver `image-resize.util`): las
 * firmas llegan del navegador a resolución de pantalla y sin eso el Excel
 * resultante pesa varios megabytes.
 */
export const insertarImagenEnCelda = async (
  hoja: ExcelJS.Worksheet,
  imagenBase64: string,
  celda: string,
  opciones: OpcionesDeImagen = {},
): Promise<void> => {
  const { proporcionAlto = 1, altoDeFila, celdaFinal } = opciones;

  const datos = imagenBase64.replace(/^data:image\/\w+;base64,/, '');
  const bufferOriginal = Buffer.from(datos, 'base64');
  const buffer = (await resizeImageBuffer(
    bufferOriginal,
  )) as unknown as ExcelJS.Buffer;

  const idImagen = hoja.workbook.addImage({ buffer, extension: 'jpeg' });

  const inicio = coordenadasDeCelda(celda);
  const fin = celdaFinal
    ? coordenadasDeCelda(celdaFinal)
    : {
        col: inicio.col,
        // Sin `celdaFinal`, el borde inferior sale de la proporción: si la
        // fila es la 40, el borde superior es 39 y con proporción 0,7 el
        // inferior queda en 39,7.
        row: inicio.row - 1 + proporcionAlto,
      };

  hoja.addImage(idImagen, {
    tl: { col: inicio.col - 1, row: inicio.row - 1 } as ExcelJS.Anchor,
    br: { col: fin.col, row: fin.row } as ExcelJS.Anchor,
    editAs: 'oneCell',
  });

  if (altoDeFila !== undefined) {
    hoja.getRow(inicio.row).height = altoDeFila;
  }
};
