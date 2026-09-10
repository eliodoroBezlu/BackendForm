import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import {
  anclarReferencia,
  corregirAreaDeImpresionEnBuffer,
  corregirLibroXml,
} from './area-de-impresion.util';

const PLANTILLAS = path.join(process.cwd(), 'src', 'templates');

/** Las que declaran área de impresión: el arreglo debe devolverla igual. */
const CON_AREA = [
  'ManLift.xlsx',
  'vehicle.xlsx',
  'Escaleras.xlsx',
  'GruaRemoto.xlsx',
  'GruaCabina.xlsx',
  'EquipoSoldar.xlsx',
  'Esmeril.xlsx',
  'Amoladora.xlsx',
  'Cilindros.xlsx',
  'Andamios.xlsx',
  'PreUsoTecle.xlsx',
  'ElementosIzaje.xlsx',
  'arnes.xlsx',
  'Grua_AT_Rev.1.xlsx',
  'Grua_RT_Rev.1.xlsx',
  'Grua_Telescopicos_Rev.2.xlsx',
  'Montacargas_Telescopicos_Rev.1.xlsx',
];

/** Las que no la declaran, y el rango que declara su propio `dimension`. */
const SIN_AREA: [string, string, string, string][] = [
  ['Taladro.xlsx', '2.03.P10.F05', 'Taladro de Banco', 'A1:R50'],
  ['FrecuenteTecle.xlsx', '3.04.P37.F25', 'Formato', 'A1:Q39'],
];

const libroDe = async (buffer: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('xl/workbook.xml')!.async('string');
};

/**
 * Las áreas de impresión declaradas, sin las comillas del nombre de hoja.
 *
 * Se quitan porque son ruido: la plantilla escribe el nombre entrecomillado
 * solo cuando lleva espacios (`'P-045'` sí, `Amoladoras` no) y ExcelJS lo
 * entrecomilla siempre. Para Excel las dos formas son la misma referencia.
 */
const areasDe = (xml: string): string[] =>
  [...xml.matchAll(/<definedName name="_xlnm\.Print_Area"[^>]*>([^<]*)</g)].map(
    (m) => m[1].replace(/&apos;/g, "'").replace(/'/g, ''),
  );

const areasDeArchivo = async (archivo: string): Promise<string[]> =>
  areasDe(await libroDe(fs.readFileSync(path.join(PLANTILLAS, archivo))));

/** Lo que sale hoy del generador: la plantilla leída y reescrita por ExcelJS. */
const comoSaleHoy = async (archivo: string): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(PLANTILLAS, archivo));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('anclarReferencia', () => {
  it('ancla filas y columnas', () => {
    expect(anclarReferencia("'ANVERSO'!$A1:$Z40")).toBe("'ANVERSO'!$A$1:$Z$40");
  });

  it('es idempotente', () => {
    const ya = "'ANVERSO'!$A$1:$Z$40";
    expect(anclarReferencia(ya)).toBe(ya);
  });

  it('no toca el nombre de la hoja aunque acabe en número', () => {
    // El caso real de Cilindros.xlsx: un reemplazo ingenuo daría «$Sheet$1».
    expect(anclarReferencia('Sheet1!$A1:$AL38')).toBe('Sheet1!$A$1:$AL$38');
  });

  it('respeta un nombre de hoja con guiones y dígitos', () => {
    expect(anclarReferencia("'P-028'!$A1:$AJ110")).toBe("'P-028'!$A$1:$AJ$110");
  });

  it('funciona sin nombre de hoja', () => {
    expect(anclarReferencia('A1:R50')).toBe('$A$1:$R$50');
  });

  it('respeta los rangos múltiples', () => {
    expect(anclarReferencia("'H'!$A1:$B2,'H'!$D1:$E2")).toBe(
      "'H'!$A$1:$B$2,'H'!$D$1:$E$2",
    );
  });
});

describe('corregirLibroXml', () => {
  const libro = (interior: string) =>
    `<workbook><sheets><sheet name="Taladro de Banco" r:id="rId1"/></sheets>${interior}</workbook>`;

  it('devuelve null cuando no hay nada que corregir', () => {
    const xml = libro(
      '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">' +
        'Hoja!$A$1:$B$2</definedName></definedNames>',
    );
    expect(corregirLibroXml(xml)).toBeNull();
  });

  it('crea el bloque de nombres cuando no existe', () => {
    const salida = corregirLibroXml(libro(''), '2.03.P10.F05');
    expect(salida).toContain(
      '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">' +
        '&apos;Taladro de Banco&apos;!$A$1:$R$50</definedName></definedNames>',
    );
    // Detrás de </sheets>, que es donde lo espera el esquema.
    expect(salida).toContain('</sheets><definedNames>');
  });

  it('se añade dentro del bloque de nombres si ya lo hay', () => {
    const xml = libro(
      '<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">' +
        'Hoja!$9:$11</definedName></definedNames>',
    );
    const salida = corregirLibroXml(xml, '2.03.P10.F05')!;
    expect(salida).toContain('_xlnm.Print_Titles');
    expect(salida.match(/<definedNames>/g)).toHaveLength(1);
  });

  it('no inventa un área si la hoja de la tabla no está en el libro', () => {
    const xml =
      '<workbook><sheets><sheet name="Otra" r:id="rId1"/></sheets></workbook>';
    expect(corregirLibroXml(xml, '2.03.P10.F05')).toBeNull();
  });

  it('no añade nada si el libro ya declara un área', () => {
    const xml = libro(
      '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">' +
        'Hoja!$A$1:$B$2</definedName></definedNames>',
    );
    expect(corregirLibroXml(xml, '2.03.P10.F05')).toBeNull();
  });

  it('reconoce el código aunque traiga la revisión detrás', () => {
    expect(corregirLibroXml(libro(''), '2.03.P10.F05 Rev.6')).not.toBeNull();
  });
});

describe('sobre las plantillas reales', () => {
  jest.setTimeout(300000);

  it.each(CON_AREA)('%s recupera el área de la plantilla', async (archivo) => {
    const esperadas = await areasDeArchivo(archivo);
    const hoy = await comoSaleHoy(archivo);

    // Comprobación de que el problema existe antes de arreglarlo.
    expect(areasDe(await libroDe(hoy))).not.toEqual(esperadas);

    const corregido = await corregirAreaDeImpresionEnBuffer(hoy);
    expect(areasDe(await libroDe(corregido))).toEqual(esperadas);
  });

  it.each(SIN_AREA)(
    '%s recibe el área que le falta',
    async (archivo, codigo, hoja, rango) => {
      const hoy = await comoSaleHoy(archivo);
      expect(areasDe(await libroDe(hoy))).toEqual([]);

      const corregido = await corregirAreaDeImpresionEnBuffer(hoy, codigo);
      expect(areasDe(await libroDe(corregido))).toEqual([
        `${hoja}!${anclarReferencia(rango)}`,
      ]);
    },
  );

  it('el rango fijado cubre todo lo que hay escrito en la plantilla', async () => {
    for (const [archivo, , , rango] of SIN_AREA) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path.join(PLANTILLAS, archivo));

      let ultimaFila = 0;
      let ultimaColumna = 0;
      workbook.worksheets[0].eachRow({ includeEmpty: false }, (fila, n) => {
        fila.eachCell({ includeEmpty: false }, (_, c) => {
          if (n > ultimaFila) ultimaFila = n;
          if (c > ultimaColumna) ultimaColumna = c;
        });
      });

      const [, esquina] = rango.split(':');
      expect(Number(esquina.replace(/[A-Z]/g, ''))).toBeGreaterThanOrEqual(
        ultimaFila,
      );
    }
  });

  it('el archivo corregido sigue siendo un Excel válido y completo', async () => {
    const censo = async (buffer: Buffer) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      let imagenes = 0;
      let merges = 0;
      const hojas: string[] = [];
      for (const hoja of workbook.worksheets) {
        hojas.push(hoja.name);
        imagenes += hoja.getImages().length;
        merges += Object.keys(
          (hoja as unknown as { _merges?: Record<string, unknown> })._merges ??
            {},
        ).length;
      }
      return { hojas, imagenes, merges };
    };

    for (const archivo of [
      'arnes.xlsx',
      'Taladro.xlsx',
      'Grua_AT_Rev.1.xlsx',
    ]) {
      const hoy = await comoSaleHoy(archivo);
      const corregido = await corregirAreaDeImpresionEnBuffer(
        hoy,
        '2.03.P10.F05',
      );
      expect(await censo(corregido)).toEqual(await censo(hoy));

      // Y las entradas del zip son exactamente las mismas.
      const entradas = async (b: Buffer) =>
        Object.keys((await JSZip.loadAsync(b)).files).sort();
      expect(await entradas(corregido)).toEqual(await entradas(hoy));
    }
  });

  it('devuelve el original si el búfer no es un Excel', async () => {
    const basura = Buffer.from('esto no es un xlsx');
    await expect(corregirAreaDeImpresionEnBuffer(basura)).resolves.toBe(basura);
  });
});
