// Ver `linternas-pdf.service.ts`: sin `esModuleInterop`, el import por
// defecto de pdfkit compila pero no existe en ejecución.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  distribuirFotos,
  proporcionDeCaja,
} from '../domain/distribucion-fotos';
import {
  AntecedentesReporte,
  EstadoReporte,
  TareaDeReporte,
} from '../domain/reporte';

/**
 * El PDF del reporte de monitoreo, con la estructura y los colores del
 * formato 2.03.P01.R09 Rev. 6 que Confiabilidad llenaba en Excel.
 *
 * Es una función pura: recibe los datos ya resueltos (nombres, color del
 * resultado, imágenes en memoria) y devuelve el PDF. Así se prueba sin base.
 *
 * Diferencias con el Excel, a propósito:
 * - ANTECEDENTES va normalizado (ficha, piezas, última intervención, informe
 *   anterior) en vez del texto libre de cada analista.
 * - La tabla de piezas se dibuja, no se pega como imagen.
 * - No hay segunda página con las celdas ocultas de cálculo.
 */

export interface ImagenParaPdf {
  /** `undefined` si el archivo ya no está: se dibuja un recuadro avisándolo. */
  contenido?: Buffer;
  descripcion: string;
  referencia: boolean;
  ancho?: number;
  alto?: number;
}

export interface ReporteParaPdf {
  tag: string;
  fecha: Date;
  tecnica?: string;
  ot?: string;
  alcance?: string;
  lecturas?: {
    horas?: number;
    fecha_horas?: Date;
    temp_referencia_c?: number;
    punto_referencia?: string;
    instrumento?: string;
    emisividad?: number;
  };
  descripcion_proceso?: string;
  analisis?: string;
  recomendaciones: string[];
  tecnica_apoyo?: string;
  resultado?: string;
  tareas: TareaDeReporte[];
  antecedentes: AntecedentesReporte;
  estado: EstadoReporte;
  codigo_interno?: string;
  fotos_por_fila: number;
}

export interface DatosPdfReporte {
  reporte: ReporteParaPdf;
  fotos: ImagenParaPdf[];
  grafico?: ImagenParaPdf;
  /** Nombres de las personas (del padrón), no sus usuarios. */
  elaboradoPor: string;
  revisadoPor?: string;
  /** El color de la severidad, como el formato condicional del Excel. */
  colorResultado?: string;
  logo?: Buffer;
}

// ── Medidas y colores ─────────────────────────────────────────────────────

const A4 = { ancho: 595.28, alto: 841.89 };
const M = 28;
const W = A4.ancho - M * 2;
/** Margen inferior más chico: lo que cabe en una hoja es lo que más se nota. */
const M_INFERIOR = 18;
/** Por debajo de esto va el «Página x de y». */
const LIMITE = A4.alto - M_INFERIOR - 12;

const C = {
  borde: '#7F7F7F',
  barra: '#D9D9D9',
  azulOscuro: '#1F3864',
  azul: '#2E75B6',
  interna: '#9DC3E6',
  negro: '#000000',
  texto: '#000000',
  tenue: '#595959',
};

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** 06-oct-26, como el formato. Las fechas del reporte son días en UTC. */
export function diaCorto(d?: Date | string): string {
  if (!d) return '';
  const f = new Date(d);
  if (Number.isNaN(f.getTime())) return '';
  const dd = String(f.getUTCDate()).padStart(2, '0');
  return `${dd}-${MESES[f.getUTCMonth()]}-${String(f.getUTCFullYear()).slice(-2)}`;
}

/** Coma decimal, sin separador de miles (el formato escribe «2044 Hrs»). */
const num = (n?: number): string =>
  n === undefined || n === null ? '' : String(n).replace('.', ',');

/** Texto claro sobre un fondo oscuro, como INTERVENCIÓN INMEDIATA en rojo. */
function textoSobre(fondo?: string): string {
  if (!fondo || !/^#[0-9a-f]{6}$/i.test(fondo)) return C.texto;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fondo.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? '#FFFFFF' : C.texto;
}

interface Estilo {
  negrita?: boolean;
  tamano?: number;
  fondo?: string;
  color?: string;
  alinear?: 'left' | 'center' | 'right';
  borde?: boolean;
}

/** Ayudante de dibujo: celdas, barras y párrafos con un cursor vertical propio. */
class Hoja {
  y = M;

  constructor(private readonly doc: PDFKit.PDFDocument) {}

  /** Salta de página si no caben `alto` puntos más. */
  reservar(alto: number): void {
    if (this.y + alto > LIMITE) {
      this.doc.addPage();
      this.y = M;
    }
  }

  celda(
    x: number,
    y: number,
    w: number,
    h: number,
    texto: string,
    e: Estilo = {},
  ): void {
    const d = this.doc;
    if (e.fondo) d.rect(x, y, w, h).fill(e.fondo);
    if (e.borde !== false) d.rect(x, y, w, h).lineWidth(0.5).stroke(C.borde);
    if (!texto) return;
    const tamano = e.tamano ?? 7;
    d.font(e.negrita ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(tamano)
      .fillColor(e.color ?? C.texto);
    const alto = d.heightOfString(texto, { width: w - 4 });
    const linea = d.currentLineHeight();
    // Centrado vertical; si no entra, se corta con «…» en vez de desbordar.
    const usar = Math.min(alto, h - 2);
    d.text(texto, x + 2, y + Math.max(1, (h - usar) / 2), {
      width: w - 4,
      height: Math.max(linea, h - 2),
      align: e.alinear ?? 'left',
      ellipsis: true,
      lineGap: 0,
    });
    d.fillColor(C.texto);
  }

  /** Una fila de celdas de anchos dados. */
  fila(
    anchos: number[],
    textos: string[],
    alto: number,
    estilos: Estilo[] = [],
  ): void {
    this.reservar(alto);
    let x = M;
    anchos.forEach((w, i) => {
      this.celda(x, this.y, w, alto, textos[i] ?? '', estilos[i] ?? {});
      x += w;
    });
    this.y += alto;
  }

  /** La barra gris de cada sección del formato. */
  barra(titulo: string): void {
    this.reservar(24); // la barra no queda sola al pie de una página
    this.celda(M, this.y, W, 10, titulo, {
      negrita: true,
      fondo: C.barra,
      tamano: 7,
    });
    this.y += 10;
  }

  /** Texto libre que fluye en el ancho completo, con borde lateral. */
  parrafo(texto: string, tamano = 7.5): void {
    const d = this.doc;
    const contenido = texto.trim() || ' ';
    d.font('Helvetica').fontSize(tamano);
    const alto = d.heightOfString(contenido, { width: W - 6 }) + 4;
    if (alto <= LIMITE - M) this.reservar(alto);
    const inicio = this.y;
    d.fillColor(C.texto).text(contenido, M + 3, this.y + 2, {
      width: W - 6,
      lineGap: 0.5,
    });
    // Si el texto cruzó de página, PDFKit ya movió el cursor: se sigue desde ahí.
    this.y = d.y > inicio ? d.y + 2 : inicio + alto;
  }

  imagen(img: ImagenParaPdf, x: number, y: number, w: number, h: number): void {
    const d = this.doc;
    d.rect(x, y, w, h).lineWidth(0.5).stroke(C.barra);
    if (!img.contenido) {
      this.celda(x, y, w, h, 'Imagen no disponible', {
        alinear: 'center',
        color: C.tenue,
        borde: false,
      });
      return;
    }
    try {
      // Se ajusta sin recortar: recortar una termografía puede cortar la escala.
      d.image(img.contenido, x, y, {
        fit: [w, h],
        align: 'center',
        valign: 'center',
      });
    } catch {
      this.celda(x, y, w, h, 'Imagen ilegible', {
        alinear: 'center',
        color: C.tenue,
        borde: false,
      });
    }
  }

  get documento(): PDFKit.PDFDocument {
    return this.doc;
  }
}

// ── Secciones ─────────────────────────────────────────────────────────────

function cabecera(h: Hoja, datos: DatosPdfReporte): void {
  const d = h.documento;
  const r = datos.reporte;
  const alto = 36;
  h.celda(M, h.y, 120, alto, '');
  if (datos.logo) {
    try {
      d.image(datos.logo, M + 6, h.y + 3, {
        fit: [108, alto - 6],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Sin logo el reporte sigue siendo válido.
    }
  }
  h.celda(M + 120, h.y, W - 240, alto, 'MONITOREO Y/O INSPECCIÓN DE EQUIPOS', {
    negrita: true,
    tamano: 10,
    alinear: 'center',
  });
  const x = M + W - 120;
  h.celda(x, h.y, 120, 12, '2.03.P01.R09', { alinear: 'center', tamano: 7 });
  h.celda(x, h.y + 12, 120, 12, 'Revisión: 6', {
    alinear: 'center',
    tamano: 7,
  });
  h.celda(x, h.y + 24, 120, 12, 'INTERNA', {
    alinear: 'center',
    tamano: 7,
    fondo: C.interna,
    color: '#FFFFFF',
  });
  h.y += alto;

  const b = { negrita: true };
  const bc = { negrita: true, alinear: 'center' as const };
  h.fila(
    [150, 45, 115, 35, 65, 40, W - 450],
    [
      'GERENCIA DE MANTENIMIENTO PLANTA',
      'ÁREA:',
      'CONFIABILIDAD',
      'TAG:',
      r.tag,
      'FECHA:',
      diaCorto(r.fecha),
    ],
    11,
    [bc, b, bc, b, bc, b, bc],
  );
  const color = datos.colorResultado;
  h.fila(
    [150, 160, 35, 65, 40, W - 450],
    [
      'TÉCNICA DE MONITOREO:',
      r.tecnica ?? '',
      'N° OT.:',
      r.ot ?? '',
      'ACCIÓN:',
      r.resultado ?? '',
    ],
    11,
    [
      bc,
      bc,
      b,
      bc,
      b,
      { ...bc, tamano: 5.5, fondo: color, color: textoSobre(color) },
    ],
  );
}

function antecedentes(h: Hoja, datos: DatosPdfReporte): void {
  const r = datos.reporte;
  const a = r.antecedentes;
  const l = r.lecturas ?? {};
  h.barra('ANTECEDENTES');

  const horas =
    l.horas !== undefined
      ? `${num(l.horas)} Hrs${l.fecha_horas ? ` (al ${diaCorto(l.fecha_horas)})` : ''}`
      : '';
  const ultima = a.ultima_intervencion
    ? [
        diaCorto(a.ultima_intervencion.fecha),
        a.ultima_intervencion.tipo,
        a.ultima_intervencion.ot && `OT ${a.ultima_intervencion.ot}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Sin registro';
  const anterior = a.informe_anterior
    ? `${a.informe_anterior.codigo_interno ?? 'Sin código'} · ${diaCorto(a.informe_anterior.fecha)}`
    : 'Ninguno emitido';
  const temp =
    l.temp_referencia_c !== undefined
      ? `${num(l.temp_referencia_c)} °C${l.punto_referencia ? ` (${l.punto_referencia})` : ''}`
      : '';

  const pares: [string, string][] = [
    [
      'Equipo bomba:',
      [a.ficha.fabricante, a.ficha.modelo].filter(Boolean).join(' · '),
    ],
    ['Horas:', horas],
    [
      'TMEF:',
      a.ficha.tmef_hrs !== undefined ? `${num(a.ficha.tmef_hrs)} Hrs` : '',
    ],
    [
      'Horas restantes:',
      a.horas_restantes !== undefined ? `${num(a.horas_restantes)} Hrs` : '',
    ],
    ['Última intervención:', ultima],
    ['Fecha tentativa:', diaCorto(a.fecha_tentativa)],
    ['Informe anterior:', anterior],
    ['Temp. referencia:', temp],
    ['Bombas pares:', a.ficha.pares ?? ''],
    ['Tag de horas PI:', a.ficha.tag_pi ?? ''],
  ];
  const mitad = (W - 160) / 2;
  for (let i = 0; i < pares.length; i += 2) {
    const [e1, v1] = pares[i];
    const [e2, v2] = pares[i + 1] ?? ['', ''];
    h.fila([80, mitad, 80, mitad], [e1, v1, e2, v2], 9.5, [
      { negrita: true, borde: false },
      { borde: false },
      { negrita: true, borde: false },
      { borde: false },
    ]);
  }

  // Sin piezas cargadas, una línea basta: una tabla vacía ocupa media
  // pulgada y no dice nada.
  if (a.componentes.length === 0) {
    h.fila(
      [80, W - 80],
      ['Piezas:', 'Sin piezas cargadas para esta bomba.'],
      9.5,
      [
        { negrita: true, borde: false },
        { borde: false, color: C.tenue },
      ],
    );
    return;
  }

  // La tabla de piezas: antes se pegaba como imagen.
  const anchos = [80, 58, 72, 58, 92, 48, 72, W - 480];
  const cab = {
    negrita: true,
    fondo: C.azulOscuro,
    color: '#FFFFFF',
    alinear: 'center' as const,
    tamano: 6.5,
  };
  h.y += 3;
  h.fila(
    anchos,
    [
      `PIEZA ${r.tag}`,
      'FECHA INSTALACIÓN',
      'PROVEEDOR',
      'CONDICIÓN INICIAL',
      'MATERIAL',
      'DUREZA (HB)',
      'ESPESOR NOM./PREC.',
      'HRS. TRABAJO',
    ],
    18,
    anchos.map(() => cab),
  );
  const centro = { alinear: 'center' as const };
  for (const c of a.componentes) {
    const espesor =
      c.espesor_nominal_mm !== undefined ||
      c.espesor_precaucion_mm !== undefined
        ? `${num(c.espesor_nominal_mm) || '—'} / ${num(c.espesor_precaucion_mm) || '—'} mm`
        : '';
    h.fila(
      anchos,
      [
        c.pieza,
        diaCorto(c.fecha_instalacion),
        c.proveedor ?? '',
        c.condicion_inicial ?? '',
        c.material ?? '',
        num(c.dureza_hb),
        espesor,
        num(c.horas_trabajo),
      ],
      11,
      [
        { negrita: true, fondo: C.azul, color: '#FFFFFF', alinear: 'center' },
        centro,
        centro,
        centro,
        centro,
        centro,
        centro,
        centro,
      ],
    );
  }
}

function proceso(h: Hoja, r: ReporteParaPdf): void {
  h.barra('DESCRIPCIÓN DEL PROCESO DE MONITOREO O ANÁLISIS DE DATOS');
  const l = r.lecturas ?? {};
  const instrumento = [
    l.instrumento && `Equipo: ${l.instrumento}`,
    l.emisividad !== undefined && `e.: ${num(l.emisividad)}`,
  ]
    .filter(Boolean)
    .join('; ');
  h.parrafo(
    [r.descripcion_proceso ?? '', instrumento].filter(Boolean).join('\n'),
  );
}

function recopilacion(h: Hoja, datos: DatosPdfReporte): void {
  h.barra('RECOPILACIÓN Y TABULACIÓN DE DATOS');
  const d = h.documento;
  const separacion = 8;
  const dist = distribuirFotos(
    datos.fotos.length,
    datos.reporte.fotos_por_fila,
    W,
    separacion,
  );
  // Todas miden lo mismo; la caja la marca la foto más alta (la misma regla
  // que la vista previa).
  const altoFoto = dist.anchoCelda * proporcionDeCaja(datos.fotos);

  h.y += 4;
  for (const fila of dist.filas) {
    d.fontSize(7);
    const leyendas = fila.indices.map((i) => leyenda(datos.fotos[i]));
    const altoLeyenda = Math.max(
      ...leyendas.map((t) =>
        d.font('Helvetica').heightOfString(t, { width: dist.anchoCelda }),
      ),
    );
    // Foto y leyenda van juntas en la misma página.
    h.reservar(altoFoto + altoLeyenda + 6);
    fila.indices.forEach((i, k) => {
      const x = M + fila.desplazamiento + k * (dist.anchoCelda + separacion);
      h.imagen(datos.fotos[i], x, h.y, dist.anchoCelda, altoFoto);
      const foto = datos.fotos[i];
      d.fillColor(C.texto).fontSize(7);
      if (foto.referencia) {
        d.font('Helvetica-Bold').text('Referencia. ', x, h.y + altoFoto + 2, {
          width: dist.anchoCelda,
          continued: true,
        });
        d.font('Helvetica').text(foto.descripcion || '');
      } else {
        d.font('Helvetica').text(
          foto.descripcion || '',
          x,
          h.y + altoFoto + 2,
          {
            width: dist.anchoCelda,
          },
        );
      }
    });
    h.y += altoFoto + altoLeyenda + 6;
  }

  if (datos.grafico) {
    // 21,9 × 7,16 cm: la caja del gráfico de PI en el formato.
    const alto = W * (7.16 / 21.9);
    const texto = datos.grafico.descripcion || '';
    d.font('Helvetica').fontSize(7);
    const altoLeyenda = texto ? d.heightOfString(texto, { width: W }) + 2 : 0;
    h.reservar(alto + altoLeyenda + 6);
    h.imagen(datos.grafico, M, h.y, W, alto);
    if (texto)
      d.fillColor(C.texto).text(texto, M, h.y + alto + 2, {
        width: W,
        align: 'center',
      });
    h.y += alto + altoLeyenda + 6;
  }
}

const leyenda = (f: ImagenParaPdf) =>
  `${f.referencia ? 'Referencia. ' : ''}${f.descripcion || ''}` || ' ';

function analisis(h: Hoja, r: ReporteParaPdf, color?: string): void {
  h.barra('ANÁLISIS Y DIAGNÓSTICO');
  h.parrafo(r.analisis ?? '');

  const g = { negrita: true, fondo: C.barra };
  h.fila(
    [130, 85, 125, 85, W - 425],
    [
      'RECOMENDACIONES',
      'TÉCNICA ADIC. APOYO:',
      r.tecnica_apoyo ?? '',
      'RESULTADO ANÁLISIS:',
      r.resultado ?? '',
    ],
    11,
    [
      g,
      g,
      { negrita: true, alinear: 'center' },
      g,
      {
        negrita: true,
        alinear: 'center',
        tamano: 6,
        fondo: color,
        color: textoSobre(color),
      },
    ],
  );
  const lista = r.recomendaciones.filter((x) => x.trim());
  h.parrafo(
    lista.length ? lista.map((x, i) => `${i + 1}.- ${x}`).join('\n') : '—',
  );
}

function tareas(h: Hoja, r: ReporteParaPdf): void {
  const ancho = (W - 130) / 5;
  const anchos = [130, ancho, ancho, ancho, ancho, ancho];
  const t = (i: number, campo: keyof TareaDeReporte) =>
    r.tareas[i]?.[campo] ?? '';
  const filas: [string, keyof TareaDeReporte][] = [
    ['* Descripción de la Tarea:', 'descripcion'],
    ['Grupo de trabajo:', 'grupo_trabajo'],
    ['Nro de OT:', 'ot'],
    ['Prioridad (JDE):', 'prioridad'],
    ['* Comunicado/Coordinado con :', 'comunicado_con'],
    ['Semana Recomendada Ejec.:', 'semana'],
  ];
  // Tareas, ANEXOS y firmas van juntas: el pie con las firmas no queda solo
  // en una hoja. 7 filas de 10, la nota, la barra (que pide 24 para no
  // quedar sola) y la fila de firmas.
  h.reservar(10 * 7 + 8 + 24 + 12);
  const cab = { negrita: true, fondo: C.barra, alinear: 'center' as const };
  h.fila(
    anchos,
    ['DESCRIPCIÓN', 'TAREA 1', 'TAREA 2', 'TAREA 3', 'TAREA 4', 'TAREA 5'],
    10,
    anchos.map(() => cab),
  );
  for (const [etiqueta, campo] of filas) {
    h.fila(anchos, [etiqueta, ...[0, 1, 2, 3, 4].map((i) => t(i, campo))], 10, [
      { negrita: true, alinear: 'right' },
      ...[0, 1, 2, 3, 4].map(() => ({
        alinear: 'center' as const,
        tamano: 6.5,
      })),
    ]);
  }
  h.fila(
    [W],
    [
      'Las descripciones que llevan por delante (*) deben ser llenadas obligatoriamente si existen recomendaciones, si corresponda una OT y WG, todos los campos deben ser llenados.',
    ],
    8,
    [{ tamano: 5.5, borde: false }],
  );
}

function pie(h: Hoja, datos: DatosPdfReporte): void {
  const r = datos.reporte;
  h.barra('ANEXOS');
  const negro = {
    negrita: true,
    fondo: C.negro,
    color: '#FFFFFF',
    alinear: 'center' as const,
  };
  const codigo = r.codigo_interno
    ? r.codigo_interno.replace('-', ' - ')
    : r.estado === EstadoReporte.PENDIENTE_REVISION
      ? 'EN REVISIÓN'
      : 'SIN EMITIR';
  h.fila(
    [65, 140, 65, 130, 70, W - 470],
    [
      'Elaborado Por:',
      datos.elaboradoPor,
      'Revisado por:',
      datos.revisadoPor ?? '',
      'Código Interno:',
      codigo,
    ],
    12,
    [
      { alinear: 'center' },
      { alinear: 'center' },
      { alinear: 'center' },
      { alinear: 'center' },
      negro,
      negro,
    ],
  );
}

/** «Página x de y» y, si no está emitido, la marca de agua. */
function marcasDePagina(doc: PDFKit.PDFDocument, estado: EstadoReporte): void {
  const { start, count } = doc.bufferedPageRange();
  const marca =
    estado === EstadoReporte.EMITIDO
      ? null
      : estado === EstadoReporte.PENDIENTE_REVISION
        ? 'EN REVISIÓN'
        : 'BORRADOR';
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // Escribir por debajo del margen haría que PDFKit abra otra página.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(C.tenue)
      .text(
        `Página ${i - start + 1} de ${count}`,
        M,
        A4.alto - M_INFERIOR - 6,
        { width: W, align: 'center' },
      );
    if (marca) {
      doc
        .save()
        .rotate(-35, { origin: [A4.ancho / 2, A4.alto / 2] })
        .font('Helvetica-Bold')
        .fontSize(90)
        .fillColor('#C00000')
        .fillOpacity(0.08)
        .text(marca, 0, A4.alto / 2 - 45, {
          width: A4.ancho,
          align: 'center',
          lineBreak: false,
        })
        .restore();
    }
    doc.page.margins.bottom = margenInferior;
  }
}

export function generarPdfReporte(datos: DatosPdfReporte): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, left: M, right: M, bottom: M_INFERIOR },
      bufferPages: true,
    });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    try {
      const r = datos.reporte;
      const h = new Hoja(doc);
      cabecera(h, datos);
      h.barra('ALCANCE');
      h.parrafo(r.alcance ?? '');
      antecedentes(h, datos);
      proceso(h, r);
      recopilacion(h, datos);
      analisis(h, r, datos.colorResultado);
      tareas(h, r);
      pie(h, datos);
      marcasDePagina(doc, r.estado);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
