import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { resizeImageBuffer } from '../../../common/utils/image-resize.util';
import { Instance } from '../schemas/instance.schema';

/**
 * Excel de la ISOP 1.02.P06.F12 **Revisión 8** (`src/templates/iroisoprev8.xlsx`).
 *
 * Convive con `ExcelIsopV7Service`: las inspecciones hechas con la Rev 7
 * se siguen descargando con el formato de la Rev 7, y las de la Rev 8 con
 * este. Quién usa cuál lo decide `InstancesDocumentService` por el número de
 * revisión de la plantilla con la que se hizo la inspección.
 *
 * La Rev 8 quitó y agregó preguntas: las filas no son las de la Rev 7.
 */

/** Cada sección de la inspección (en orden) y el bloque de filas que le corresponde. */
const SECCIONES: { nombre: string; primeraFila: number; ultimaFila: number }[] =
  [
    { nombre: '1. Orden y aseo (5Ss)', primeraFila: 34, ultimaFila: 45 },
    {
      nombre: '2. Preparación para emergencias — General',
      primeraFila: 49,
      ultimaFila: 65,
    },
    {
      nombre: '3. Elementos de protección personal',
      primeraFila: 68,
      ultimaFila: 74,
    },
    { nombre: '4. Herramientas de mano', primeraFila: 77, ultimaFila: 87 },
    {
      nombre: '5. Oficinas y otros ambientes',
      primeraFila: 91,
      ultimaFila: 98,
    },
    {
      nombre: '5. Calefactores verticales, de techo/pared y estufas',
      primeraFila: 100,
      ultimaFila: 102,
    },
    { nombre: '5. Cafeterías', primeraFila: 104, ultimaFila: 108 },
    {
      nombre: '5. Duchas, vestidores y servicios higiénicos',
      primeraFila: 110,
      ultimaFila: 133,
    },
    { nombre: '6. Señalización', primeraFila: 136, ultimaFila: 144 },
    {
      nombre: '7. Vehículos / estacionamientos',
      primeraFila: 147,
      ultimaFila: 162,
    },
  ];

/** Datos generales: etiqueta del campo de verificación → celda del valor. */
const DATOS_GENERALES: Record<string, string> = {
  SUPERVISOR: 'H8',
  'INSPECCION N': 'N8',
  'LUGAR INSPECCIONADO': 'H9',
  EMPRESA: 'M9',
  'FECHA INSPECCION': 'H10',
};

const EQUIPO = {
  primeraFila: 14,
  maximo: 6,
  nombre: 'B',
  cargo: 'F',
  firma: 'N',
};
const COLUMNA_RESPUESTA = 'F';
const COLUMNA_COMENTARIO = 'G';
const CELDA_ASPECTOS_POSITIVOS = 'A166';
const CELDA_OPORTUNIDADES_MEJORA = 'A169';

/** Mayúsculas sin tildes ni signos: «Inspección N°» → «INSPECCION N». */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** El formato pide `yyyy-mm-dd` y la base guarda el instante completo. */
const FECHA_DEL_FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * `2026-10-04T04:00:00.000Z` → `2026-10-04`. Se lee en hora de Bolivia y no
 * cortando el texto: el instante va en UTC, y una hora local después de las
 * 20:00 ya cae en el día siguiente en UTC. Lo que no sea fecha queda igual.
 */
const valorDeCelda = (valor: unknown): string => {
  if (valor instanceof Date) return FECHA_DEL_FORMATO.format(valor);
  const texto = typeof valor === 'string' ? valor : String(valor ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(texto)) return texto;
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime())
    ? texto
    : FECHA_DEL_FORMATO.format(fecha);
};

@Injectable()
export class ExcelIsopRev8Service {
  private readonly logger = new Logger(ExcelIsopRev8Service.name);
  private readonly templatePath = path.join(
    process.cwd(),
    'src',
    'templates',
    'iroisoprev8.xlsx',
  );

  async generateExcel(instance: Instance): Promise<Buffer> {
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`El archivo template no existe en: ${this.templatePath}`);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);
    // Las hojas de exportación traen tablas y filtros que ExcelJS no reescribe bien.
    for (const hoja of workbook.worksheets) {
      (hoja as unknown as { tables: unknown[] }).tables = [];
      hoja.autoFilter = undefined;
    }
    const hoja = workbook.worksheets[0];

    this.llenarDatosGenerales(hoja, instance);
    await this.llenarEquipo(hoja, instance);
    this.llenarSecciones(hoja, instance);
    hoja.getCell(CELDA_ASPECTOS_POSITIVOS).value =
      instance.aspectosPositivos || '';
    hoja.getCell(CELDA_OPORTUNIDADES_MEJORA).value =
      instance.aspectosAdicionales || '';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Por etiqueta y no por posición: agregar un campo de verificación no corre los demás. */
  private llenarDatosGenerales(hoja: ExcelJS.Worksheet, instance: Instance) {
    const lista = instance.verificationList as unknown as
      | Map<string, string>
      | Record<string, string>
      | undefined;
    const entradas =
      lista instanceof Map ? [...lista.entries()] : Object.entries(lista ?? {});
    for (const [etiqueta, valor] of entradas) {
      const clave = normalizar(etiqueta);
      const celda = Object.entries(DATOS_GENERALES).find(([prefijo]) =>
        clave.startsWith(prefijo),
      )?.[1];
      if (celda) hoja.getCell(celda).value = valorDeCelda(valor);
      else
        this.logger.warn(
          `Campo de verificación sin celda en la Rev 8: «${etiqueta}»`,
        );
    }
  }

  private async llenarEquipo(hoja: ExcelJS.Worksheet, instance: Instance) {
    const equipo = instance.inspectionTeam ?? [];
    if (equipo.length > EQUIPO.maximo) {
      this.logger.warn(
        `El equipo tiene ${equipo.length} integrantes; el formato admite ${EQUIPO.maximo}`,
      );
    }
    for (const [i, integrante] of equipo.slice(0, EQUIPO.maximo).entries()) {
      const fila = EQUIPO.primeraFila + i;
      if (integrante.nombre)
        hoja.getCell(`${EQUIPO.nombre}${fila}`).value = integrante.nombre;
      if (integrante.cargo)
        hoja.getCell(`${EQUIPO.cargo}${fila}`).value = integrante.cargo;
      if (integrante.firma?.startsWith('data:image/')) {
        await this.insertarFirma(
          hoja,
          integrante.firma,
          `${EQUIPO.firma}${fila}`,
          fila,
        );
      }
    }
  }

  private llenarSecciones(hoja: ExcelJS.Worksheet, instance: Instance) {
    const secciones = instance.sections ?? [];
    if (secciones.length !== SECCIONES.length) {
      this.logger.warn(
        `La inspección trae ${secciones.length} secciones; la Rev 8 tiene ${SECCIONES.length}`,
      );
    }
    secciones.forEach((seccion, i) => {
      const bloque = SECCIONES[i];
      if (!bloque) return;
      const capacidad = bloque.ultimaFila - bloque.primeraFila + 1;
      if (seccion.questions.length !== capacidad) {
        this.logger.warn(
          `«${bloque.nombre}»: ${seccion.questions.length} preguntas para ${capacidad} filas`,
        );
      }
      seccion.questions.slice(0, capacidad).forEach((pregunta, j) => {
        const fila = bloque.primeraFila + j;
        if (pregunta.response !== undefined && pregunta.response !== null) {
          hoja.getCell(`${COLUMNA_RESPUESTA}${fila}`).value = pregunta.response;
        }
        if (pregunta.comment?.trim())
          hoja.getCell(`${COLUMNA_COMENTARIO}${fila}`).value = pregunta.comment;
      });
    });
  }

  private async insertarFirma(
    hoja: ExcelJS.Worksheet,
    base64: string,
    celda: string,
    fila: number,
  ) {
    try {
      const crudo = Buffer.from(
        base64.replace(/^data:image\/\w+;base64,/, ''),
        'base64',
      );
      const imagen = (await resizeImageBuffer(
        crudo,
      )) as unknown as ExcelJS.Buffer;
      const id = hoja.workbook.addImage({ buffer: imagen, extension: 'jpeg' });
      const columna = hoja.getColumn(celda.replace(/\d+$/, '')).number;
      hoja.addImage(id, {
        tl: { col: columna - 1, row: fila - 1 } as ExcelJS.Anchor,
        br: { col: columna, row: fila } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });
      hoja.getRow(fila).height = Math.max(25, hoja.getRow(fila).height || 15);
    } catch (error) {
      this.logger.error(
        `No se pudo insertar la firma en ${celda}: ${(error as Error).message}`,
      );
    }
  }
}
