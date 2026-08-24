import * as ExcelJS from 'exceljs';
import { insertarImagenEnCelda } from './imagen-excel.util';

/**
 * Se ejercita contra un libro de ExcelJS de verdad —no un doble— porque lo que
 * hay que comprobar es exactamente lo que antes hacían las 14 copias: dónde
 * queda anclada la imagen y qué le pasa a la fila.
 */

// PNG de 1×1 transparente.
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface ImagenAnclada {
  range: { tl: { col: number; row: number }; br: { col: number; row: number } };
}

const imagenesDe = (hoja: ExcelJS.Worksheet): ImagenAnclada[] =>
  hoja.getImages() as unknown as ImagenAnclada[];

const nuevaHoja = () => new ExcelJS.Workbook().addWorksheet('Prueba');

describe('insertarImagenEnCelda', () => {
  it('ancla la imagen en la celda indicada', async () => {
    const hoja = nuevaHoja();

    await insertarImagenEnCelda(hoja, PNG_1x1, 'C5');

    const [imagen] = imagenesDe(hoja);
    // ExcelJS cuenta desde 0; la celda C5 es fila 5, columna 3.
    expect(imagen.range.tl).toMatchObject({ col: 2, row: 4 });
    expect(imagen.range.br).toMatchObject({ col: 3, row: 5 });
  });

  it('registra la imagen en el libro', async () => {
    const hoja = nuevaHoja();

    await insertarImagenEnCelda(hoja, PNG_1x1, 'A1');

    expect(imagenesDe(hoja)).toHaveLength(1);
  });

  it('fija el alto de la fila solo si se le pide', async () => {
    const conAlto = nuevaHoja();
    await insertarImagenEnCelda(conAlto, PNG_1x1, 'B3', { altoDeFila: 25 });
    expect(conAlto.getRow(3).height).toBe(25);

    const sinAlto = nuevaHoja();
    await insertarImagenEnCelda(sinAlto, PNG_1x1, 'B3');
    expect(sinAlto.getRow(3).height).toBeUndefined();
  });

  it('con proporcion, la imagen ocupa parte del alto de la fila', async () => {
    const hoja = nuevaHoja();

    await insertarImagenEnCelda(hoja, PNG_1x1, 'A40', { proporcionAlto: 0.7 });

    const [imagen] = imagenesDe(hoja);
    // Borde superior en 39; con 0,7 el inferior queda en 39,7.
    expect(imagen.range.tl.row).toBe(39);
    expect(imagen.range.br.row).toBeCloseTo(39.7);
  });

  it('con celda final, la imagen abarca todo el rango', async () => {
    const hoja = nuevaHoja();

    await insertarImagenEnCelda(hoja, PNG_1x1, 'H71', { celdaFinal: 'L85' });

    const [imagen] = imagenesDe(hoja);
    expect(imagen.range.tl).toMatchObject({ col: 7, row: 70 });
    expect(imagen.range.br).toMatchObject({ col: 12, row: 85 });
  });

  it('acepta el base64 con y sin la cabecera data:', async () => {
    const conCabecera = nuevaHoja();
    await insertarImagenEnCelda(conCabecera, PNG_1x1, 'A1');

    const sinCabecera = nuevaHoja();
    await insertarImagenEnCelda(
      sinCabecera,
      PNG_1x1.replace(/^data:image\/\w+;base64,/, ''),
      'A1',
    );

    expect(imagenesDe(conCabecera)).toHaveLength(1);
    expect(imagenesDe(sinCabecera)).toHaveLength(1);
  });

  it('unos datos ilegibles NO hacen fallar la insercion', async () => {
    const hoja = nuevaHoja();

    // `resizeImageBuffer` absorbe el error a proposito y devuelve el buffer
    // original antes que romper el export completo. Consecuencia: el
    // try/catch que los 14 generadores tienen alrededor de esta llamada casi
    // nunca se dispara — solo cubre fallos de ExcelJS, no de la imagen.
    await expect(
      insertarImagenEnCelda(hoja, 'esto-no-es-una-imagen', 'A1'),
    ).resolves.toBeUndefined();

    expect(imagenesDe(hoja)).toHaveLength(1);
  });
});
