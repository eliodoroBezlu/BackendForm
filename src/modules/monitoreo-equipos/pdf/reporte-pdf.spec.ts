import * as sharpNs from 'sharp';
import { EstadoReporte } from '../domain/reporte';
import { valoresVacios } from '../domain/espesores';
import { ESTRUCTURA_250SA225 } from '../__pruebas__/medicion-250sa225';
import { nombreDeArchivo } from '../reporte-pdf.service';
import {
  DatosPdfReporte,
  diaCorto,
  generarPdfReporte,
  ImagenParaPdf,
  ReporteParaPdf,
} from './reporte-pdf';

const sharp = sharpNs as unknown as typeof sharpNs.default;
const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));

/** Páginas del PDF: los diccionarios de página no van comprimidos. */
const paginas = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

const REPORTE: ReporteParaPdf = {
  tag: '230PP013',
  fecha: dia(2026, 10, 6),
  tecnica: 'TERMOGRAFIA MECANICA',
  ot: '952013',
  alcance: 'Seguimiento de elementos de desgaste nuevos.',
  lecturas: { horas: 2044, instrumento: 'EPOCH-XT' },
  analisis: 'Sin anomalías.',
  recomendaciones: ['Nueva medición según plan'],
  resultado: 'NORMAL',
  tareas: [{ descripcion: 'Nueva medición', comunicado_con: 'Wilmers Cruz' }],
  antecedentes: {
    tomados_en: dia(2026, 10, 6),
    ficha: { modelo: 'WARMAN ASH 550 MMC' },
    componentes: [
      {
        pieza: 'Voluta',
        fecha_instalacion: dia(2026, 6, 28),
        horas_trabajo: 2044,
      },
    ],
  },
  estado: EstadoReporte.EMITIDO,
  codigo_interno: 'COTEM-0137',
  fotos_por_fila: 3,
};

describe('PDF del reporte de monitoreo', () => {
  let foto: Buffer;
  beforeAll(async () => {
    // Una termografía de pie, como las de la FLIR E95.
    foto = await sharp({
      create: { width: 348, height: 464, channels: 3, background: '#c33' },
    })
      .jpeg()
      .toBuffer();
  });

  const fotos = (n: number): ImagenParaPdf[] =>
    Array.from({ length: n }, (_, i) => ({
      contenido: foto,
      descripcion: `Foto ${i + 1}`,
      referencia: false,
      ancho: 348,
      alto: 464,
    }));

  const generar = (extra: Partial<DatosPdfReporte> = {}) =>
    generarPdfReporte({
      reporte: REPORTE,
      fotos: fotos(3),
      elaboradoPor: 'Santos Ventura',
      revisadoPor: 'Wilmers Cruz',
      colorResultado: '#92D050',
      ...extra,
    });

  it('un reporte como COTEM137 entra en una página', async () => {
    const pdf = await generar();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
  });

  it('un ultrasonido como COULT482 lleva su tabla de espesores sin romper el PDF', async () => {
    const valores = valoresVacios(ESTRUCTURA_250SA225).map((zonas) =>
      zonas.map((filas) =>
        filas.map((fila) => fila.map((_, n) => 6 + n / 100)),
      ),
    );
    valores[6][1][2][0] = 5.39; // bajo la alerta: va en rojo
    const pdf = await generar({
      reporte: {
        ...REPORTE,
        tag: '250SA225',
        tecnica: 'ULTRASONIDO ACTIVO',
        antecedentes_texto: 'Cambio de la válvula dardo LV250033.',
        lecturas: {
          instrumento: 'TI-CMX',
          velocidad_ms: 5920,
          frecuencia_mhz: 7.5,
        },
        antecedentes: {
          tomados_en: dia(2026, 11, 12),
          ficha: {},
          componentes: [],
          medicion_anterior: {
            id: 'x',
            codigo_interno: 'COULT-0481',
            fecha: dia(2026, 4, 25),
            minimos: [{ pieza: '3', zona: 'Lado Sur', minimo: 5.61 }],
          },
        },
        medicion: {
          estructura: ESTRUCTURA_250SA225,
          diagramas: [],
          valores,
        },
      },
      fotos: [],
      diagramas: fotos(2),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBeLessThanOrEqual(3);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'con %i fotos se genera sin fallar',
    async (n) => {
      const pdf = await generar({ fotos: fotos(n) });
      expect(paginas(pdf)).toBeGreaterThanOrEqual(1);
    },
  );

  it('muchas fotos y un texto largo pasan a otra página en vez de cortarse', async () => {
    const pdf = await generar({
      fotos: fotos(12),
      reporte: { ...REPORTE, analisis: 'Texto largo. '.repeat(400) },
    });
    expect(paginas(pdf)).toBeGreaterThan(1);
  });

  it('el informe anterior pegado como enlace se puede abrir desde el PDF', async () => {
    const url = 'https://empresa.sharepoint.com/COTEM136.pdf';
    const pdf = await generar({
      reporte: { ...REPORTE, informe_anterior_url: url },
    });
    // La anotación del enlace no va comprimida.
    expect(pdf.toString('latin1')).toContain(`/URI (${url})`);
  });

  it('los anexos salen en ANEXOS, antes de las firmas, sin romper el PDF', async () => {
    const sinAnexos = await generar();
    const conAnexos = await generar({ anexos: fotos(4) });
    expect(paginas(conAnexos)).toBeGreaterThan(paginas(sinAnexos));
  });

  it('una imagen que falta o no se puede leer no impide el PDF', async () => {
    const pdf = await generar({
      fotos: [
        { contenido: undefined, descripcion: 'Borrada', referencia: false },
        {
          contenido: Buffer.from('no es una imagen'),
          descripcion: 'Rota',
          referencia: false,
        },
      ],
      grafico: {
        contenido: Buffer.from('tampoco'),
        descripcion: '',
        referencia: false,
      },
    });
    expect(paginas(pdf)).toBe(1);
  });

  it('un borrador sin logo, sin gráfico, sin piezas ni tareas también sale', async () => {
    const pdf = await generar({
      fotos: [],
      reporte: {
        ...REPORTE,
        estado: EstadoReporte.BORRADOR,
        codigo_interno: undefined,
        tareas: [],
        recomendaciones: [],
        antecedentes: {
          tomados_en: dia(2026, 10, 6),
          ficha: {},
          componentes: [],
        },
      },
      revisadoPor: undefined,
    });
    expect(paginas(pdf)).toBe(1);
  });

  it('las fechas van como en el formato', () => {
    expect(diaCorto(dia(2026, 10, 6))).toBe('06-oct-26');
    expect(diaCorto(dia(2026, 1, 17))).toBe('17-ene-26');
    expect(diaCorto(undefined)).toBe('');
  });

  it('el archivo se llama como los nombra Confiabilidad', () => {
    expect(
      nombreDeArchivo({
        estado: EstadoReporte.EMITIDO,
        codigo_interno: 'COTEM-0137',
        correlativo: 137,
        tag: '230PP013',
        fecha: dia(2026, 10, 6),
      }),
    ).toBe('COTEM137 230PP013 06OCT26.pdf');
    expect(
      nombreDeArchivo({
        estado: EstadoReporte.EMITIDO,
        codigo_interno: 'COTEM-0009',
        correlativo: 9,
        tag: '420PP557',
        fecha: dia(2026, 1, 17),
      }),
    ).toBe('COTEM009 420PP557 17ENE26.pdf');
    expect(
      nombreDeArchivo({
        estado: EstadoReporte.BORRADOR,
        tag: '230PP013',
        fecha: dia(2026, 10, 6),
      }),
    ).toBe('BORRADOR 230PP013 06OCT26.pdf');
  });
});
