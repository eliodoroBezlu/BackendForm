import { Logger } from '@nestjs/common';
import * as JSZip from 'jszip';

/**
 * Devuelve al Excel generado el área de impresión que traía la plantilla.
 *
 * ── El problema ───────────────────────────────────────────────────────────
 *
 * Los generadores abren la plantilla con ExcelJS y la vuelven a escribir. En
 * esa vuelta, ExcelJS estropea el área de impresión de dos maneras:
 *
 * 1. **Pierde el anclaje de fila.** La plantilla declara
 *    `ANVERSO!$A$1:$Z$40` y sale `'ANVERSO'!$A1:$Z40`. Le pasa a 17 de las 19
 *    plantillas de herramientas.
 * 2. **En las que no declaran área, recorta el rango impreso.** Sin área
 *    declarada se imprime el rango usado, y ExcelJS lo recalcula contando solo
 *    las celdas que existen. `Taladro.xlsx` declara hasta la columna R, pero
 *    de la O a la R solo hay ancho definido y ninguna celda escrita: el rango
 *    pasa de `A1:R50` a `A1:O50` y **se pierden tres columnas de ancho
 *    impreso**.
 *
 * ── Por qué solo se nota en algunas ───────────────────────────────────────
 *
 * Porque depende de si la hoja lleva `fitToPage`. Las que lo llevan encajan
 * todo en una página pase lo que pase y absorben el cambio sin que se vea. Las
 * de **escala fija** no: cualquier variación del área impresa empuja el
 * contenido más allá del borde y se va a una segunda hoja.
 *
 * Las cuatro donde se notaba —taladro de banco (50 %), pre-uso de tecles
 * (67 %), elementos de izaje (89 %) y puente grúa a control remoto (77 %)— son
 * justamente las cuatro de escala fija. Las que no daban problema —arnés,
 * escaleras, amoladora, esmeril, andamios, vehículo, equipo de soldar…— llevan
 * todas `fitToPage`. Les pasaba lo mismo por dentro; no se veía.
 *
 * ── Por qué se corrige sobre el zip y no con la API de ExcelJS ────────────
 *
 * Porque por la API hay que reescribir el libro entero, y eso son **1,9 s** en
 * las plantillas de grúas, que son las más pesadas (hasta 1884 celdas
 * combinadas). Tocando solo `xl/workbook.xml` dentro del zip son **3 ms**: el
 * resto de las entradas se copian ya comprimidas, sin volver a serializarlas.
 * De paso se evita una segunda vuelta del libro por el modelo de ExcelJS.
 */

/** La única entrada del zip que hace falta tocar. */
const RUTA_LIBRO = 'xl/workbook.xml';

/**
 * Plantillas que no declaran área de impresión, con el rango que declara su
 * propio `dimension`.
 *
 * Se comprobó generando los archivos que ninguno de los dos generadores
 * escribe fuera de él —frecuente de tecles llega a `Q39`, taladro a `N47`—,
 * así que fijarlo no recorta nada. La prueba de este archivo lo verifica
 * contra las plantillas reales: si alguna cambia, falla ahí y no en
 * producción.
 */
const AREAS_QUE_FALTAN: Record<string, { hoja: string; rango: string }> = {
  '2.03.P10.F05': { hoja: 'Taladro de Banco', rango: 'A1:R50' },
  '3.04.P37.F25': { hoja: 'Formato', rango: 'A1:Q39' },
};

const logger = new Logger('AreaDeImpresion');

/** `A1` → `$A$1`; lo que no sea una celda se deja como está. */
const anclarCelda = (celda: string): string =>
  celda.replace(/\$/g, '').replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');

/**
 * Ancla filas y columnas de una referencia, respetando el nombre de la hoja.
 *
 * El nombre **no se puede tocar**: la hoja de `Cilindros.xlsx` se llama
 * `Sheet1`, y un reemplazo que mirase la referencia entera la convertiría en
 * `$Sheet$1`. Por eso se separa por el `!` y solo se trabaja a su derecha.
 *
 * `'Hoja'!$A1:$Z40` y `'Hoja'!$A$1:$Z$40` dan los dos el mismo resultado, así
 * que aplicarlo dos veces no cambia nada.
 */
export const anclarReferencia = (referencia: string): string =>
  referencia
    .split(',')
    .map((tramo) => {
      const corte = tramo.lastIndexOf('!');
      const hoja = corte >= 0 ? tramo.slice(0, corte + 1) : '';
      const rango = tramo.slice(corte + 1);
      return hoja + rango.split(':').map(anclarCelda).join(':');
    })
    .join(',');

/** Nombre de hoja como lo escribe Excel dentro de un nombre definido. */
const hojaEntrecomillada = (nombre: string): string =>
  `&apos;${nombre.replace(/'/g, "''")}&apos;`;

/** La entrada de la tabla que corresponde a un templateCode, si la hay. */
const areaQueFalta = (
  templateCode: string | undefined,
): { hoja: string; rango: string } | undefined => {
  if (!templateCode) return undefined;
  // El código puede traer la revisión detrás («2.03.P10.F05 Rev.6»), igual que
  // en el despachador.
  const clave = Object.keys(AREAS_QUE_FALTAN).find((c) =>
    templateCode.includes(c),
  );
  return clave ? AREAS_QUE_FALTAN[clave] : undefined;
};

/** Posición de una hoja dentro de `<sheets>`, que es lo que pide `localSheetId`. */
const indiceDeHoja = (xml: string, nombre: string): number =>
  [...xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)]
    .map((m) => m[1])
    .indexOf(nombre);

/**
 * Corrige el `xl/workbook.xml` de un libro generado.
 *
 * @returns el XML corregido, o `null` si no había nada que corregir.
 */
export const corregirLibroXml = (
  xml: string,
  templateCode?: string,
): string | null => {
  let cambios = 0;

  let salida = xml.replace(
    /(<definedName name="_xlnm\.Print_Area"[^>]*>)([^<]*)(<\/definedName>)/g,
    (_, apertura: string, referencia: string, cierre: string) => {
      const anclada = anclarReferencia(referencia);
      if (anclada !== referencia) cambios += 1;
      return `${apertura}${anclada}${cierre}`;
    },
  );

  const falta = areaQueFalta(templateCode);
  if (falta && !/_xlnm\.Print_Area/.test(salida)) {
    const indice = indiceDeHoja(salida, falta.hoja);
    if (indice >= 0) {
      const entrada =
        `<definedName name="_xlnm.Print_Area" localSheetId="${indice}">` +
        `${hojaEntrecomillada(falta.hoja)}!${anclarReferencia(falta.rango)}` +
        `</definedName>`;

      // Si ya hay un bloque de nombres se añade dentro; si no, se crea justo
      // detrás de `</sheets>`, que es donde lo espera el esquema.
      salida = /<definedNames>/.test(salida)
        ? salida.replace('</definedNames>', `${entrada}</definedNames>`)
        : salida.replace(
            '</sheets>',
            `</sheets><definedNames>${entrada}</definedNames>`,
          );
      cambios += 1;
    }
  }

  return cambios > 0 ? salida : null;
};

/**
 * Aplica la corrección sobre un Excel ya serializado y devuelve el nuevo.
 *
 * Si no hay nada que corregir se devuelve el búfer tal cual: así el archivo
 * que ya estaba bien sale idéntico al que salía antes.
 *
 * Si algo falla se devuelve el original. Un margen torcido es mucho menos
 * grave que una descarga que no se produce.
 */
export const corregirAreaDeImpresionEnBuffer = async (
  buffer: Buffer,
  templateCode?: string,
): Promise<Buffer> => {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const libro = zip.file(RUTA_LIBRO);
    if (!libro) return buffer;

    const corregido = corregirLibroXml(
      await libro.async('string'),
      templateCode,
    );
    if (!corregido) return buffer;

    zip.file(RUTA_LIBRO, corregido);
    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  } catch (error) {
    logger.warn(
      `No se pudo corregir el área de impresión, se descarga el Excel sin corregir: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return buffer;
  }
};
