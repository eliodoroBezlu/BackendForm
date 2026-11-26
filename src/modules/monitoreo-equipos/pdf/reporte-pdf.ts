// Ver `linternas-pdf.service.ts`: sin `esModuleInterop`, el import por
// defecto de pdfkit compila pero no existe en ejecución.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  distribuirFotos,
  proporcionDeCaja,
} from '../domain/distribucion-fotos';
import { PIEZAS_BOMBA } from '../domain/bomba';
import {
  AntecedentesReporte,
  EstadoReporte,
  MedicionDelReporte,
  PiezaDeAntecedentes,
  TareaDeReporte,
} from '../domain/reporte';
import {
  A4,
  C,
  diaCorto,
  Hoja,
  ImagenParaPdf,
  M,
  M_INFERIOR,
  num,
  textoSobre,
  W,
} from './hoja';
import { diagramasDeMedicion, tablaDeEspesores } from './tabla-espesores';

export { diaCorto } from './hoja';
export type { ImagenParaPdf } from './hoja';

/**
 * El PDF del reporte de monitoreo, con la estructura y los colores del
 * formato 2.03.P01.R09 Rev. 6 que Confiabilidad llenaba en Excel.
 *
 * Es una función pura: recibe los datos ya resueltos (nombres, color del
 * resultado, imágenes en memoria) y devuelve el PDF. Así se prueba sin base.
 *
 * Diferencias con el Excel, a propósito:
 * - ANTECEDENTES va normalizado (ficha, piezas, última intervención, informe
 *   anterior) en vez del texto libre de cada analista. Sin TMEF, horas
 *   restantes, fecha tentativa, bombas pares ni tag de PI (Confiabilidad,
 *   2026-11-18).
 * - La tabla de piezas se dibuja, no se pega como imagen, sale siempre con
 *   sus cuatro piezas aunque falten datos y va debajo del gráfico de PI
 *   (Confiabilidad, 2026-11-26).
 * - Un reporte con medición de espesores (ultrasonido) lleva ANTECEDENTES en
 *   texto, los diagramas del equipo y la tabla de espesores dibujada.
 * - Las imágenes de más van en ANEXOS, antes de las firmas.
 * - No hay segunda página con las celdas ocultas de cálculo.
 */

export interface ReporteParaPdf {
  tag: string;
  fecha: Date;
  tecnica?: string;
  ot?: string;
  alcance?: string;
  /** Enlace al informe anterior, pegado por el analista. */
  informe_anterior_url?: string;
  lecturas?: {
    horas?: number;
    fecha_horas?: Date;
    temp_referencia_c?: number;
    punto_referencia?: string;
    instrumento?: string;
    emisividad?: number;
    velocidad_ms?: number;
    frecuencia_mhz?: number;
  };
  /** ANTECEDENTES en texto (reportes con medición de espesores). */
  antecedentes_texto?: string;
  medicion?: MedicionDelReporte;
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
  /** Las imágenes de ANEXOS. */
  anexos?: ImagenParaPdf[];
  /** Los diagramas de la medición de espesores, en el orden de la plantilla. */
  diagramas?: ImagenParaPdf[];
  /** Nombres de las personas (del padrón), no sus usuarios. */
  elaboradoPor: string;
  revisadoPor?: string;
  /** El color de la severidad, como el formato condicional del Excel. */
  colorResultado?: string;
  logo?: Buffer;
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
  if (r.medicion) {
    antecedentesDeMedicion(h, r);
    return;
  }

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
  const temp =
    l.temp_referencia_c !== undefined
      ? `${num(l.temp_referencia_c)} °C${l.punto_referencia ? ` (${l.punto_referencia})` : ''}`
      : '';
  const { texto: anterior, url } = informeAnterior(r);

  const pares: [string, string][] = [
    [
      'Equipo bomba:',
      [a.ficha.fabricante, a.ficha.modelo].filter(Boolean).join(' · '),
    ],
    ['Horas:', horas],
    ['Última intervención:', ultima],
    ['Temp. referencia:', temp],
    ['Informe anterior:', anterior],
    ['', ''],
  ];
  const mitad = (W - 160) / 2;
  for (let i = 0; i < pares.length; i += 2) {
    const [e1, v1] = pares[i];
    const [e2, v2] = pares[i + 1] ?? ['', ''];
    const esEnlace = e1 === 'Informe anterior:' && !!url;
    h.fila([80, mitad, 80, mitad], [e1, v1, e2, v2], 9.5, [
      { negrita: true, borde: false },
      { borde: false, color: esEnlace ? C.azul : undefined },
      { negrita: true, borde: false },
      { borde: false },
    ]);
    // El enlace se puede abrir desde el PDF.
    if (esEnlace) h.documento.link(M + 80, h.y - 9.5, mitad, 9.5, url);
  }
}

/** El enlace que pegó el analista; si no hay, el último emitido del sistema. */
function informeAnterior(r: ReporteParaPdf): { texto: string; url?: string } {
  const url = r.informe_anterior_url?.trim() || undefined;
  const a = r.antecedentes.informe_anterior;
  return {
    url,
    texto:
      url ??
      (a ? `${a.codigo_interno ?? 'Sin código'} · ${diaCorto(a.fecha)}` : ''),
  };
}

/** ANTECEDENTES de un reporte con medición: el texto del analista y lo anterior. */
function antecedentesDeMedicion(h: Hoja, r: ReporteParaPdf): void {
  h.parrafo(r.antecedentes_texto ?? '');
  const { texto, url } = informeAnterior(r);
  const m = r.antecedentes.medicion_anterior;
  const medicion = m
    ? `${m.codigo_interno ?? 'Sin código'} · ${diaCorto(m.fecha)}`
    : 'Sin medición anterior';
  const mitad = (W - 180) / 2;
  h.fila(
    [80, mitad, 100, mitad],
    ['Informe anterior:', texto, 'Medición anterior:', medicion],
    9.5,
    [
      { negrita: true, borde: false },
      { borde: false, color: url ? C.azul : undefined },
      { negrita: true, borde: false },
      { borde: false },
    ],
  );
  if (url) h.documento.link(M + 80, h.y - 9.5, mitad, 9.5, url);
}

/**
 * La tabla de piezas de la bomba: siempre las cuatro, aunque falte algún
 * dato. Va debajo del gráfico de PI.
 */
function tablaDePiezas(h: Hoja, datos: DatosPdfReporte): void {
  const r = datos.reporte;
  const a = r.antecedentes;
  const porPieza = new Map(a.componentes.map((c) => [c.pieza, c]));
  const filas: PiezaDeAntecedentes[] = [
    ...PIEZAS_BOMBA.map((p) => porPieza.get(p) ?? { pieza: p }),
    ...a.componentes.filter(
      (c) => !(PIEZAS_BOMBA as readonly string[]).includes(c.pieza),
    ),
  ];
  const anchos = [90, 78, 92, 82, 0, 66];
  anchos[4] = W - anchos.reduce((t, x) => t + x, 0);
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
      'HRS. TRABAJO',
    ],
    18,
    anchos.map(() => cab),
  );
  const centro = { alinear: 'center' as const };
  for (const c of filas) {
    h.fila(
      anchos,
      [
        c.pieza,
        diaCorto(c.fecha_instalacion),
        c.proveedor ?? '',
        c.condicion_inicial ?? '',
        c.material ?? '',
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
      ],
    );
  }
  h.y += 4;
}

function proceso(h: Hoja, r: ReporteParaPdf): void {
  h.barra('DESCRIPCIÓN DEL PROCESO DE MONITOREO O ANÁLISIS DE DATOS');
  const l = r.lecturas ?? {};
  const instrumento = [
    l.instrumento && `Equipo: ${l.instrumento}`,
    l.emisividad !== undefined && `e.: ${num(l.emisividad)}`,
    l.velocidad_ms !== undefined && `Vel.: ${num(l.velocidad_ms)} m/s`,
    l.frecuencia_mhz !== undefined && `Sensor: ${num(l.frecuencia_mhz)} MHz`,
  ]
    .filter(Boolean)
    .join('; ');
  h.parrafo(
    [r.descripcion_proceso ?? '', instrumento].filter(Boolean).join('\n'),
  );
}

/**
 * Imágenes en filas de `porFila`, todas del mismo tamaño, con su leyenda
 * debajo y en la misma página. La usan la recopilación y los anexos.
 */
function grillaDeImagenes(
  h: Hoja,
  imagenes: ImagenParaPdf[],
  porFila: number,
): void {
  const d = h.documento;
  const separacion = 8;
  const dist = distribuirFotos(imagenes.length, porFila, W, separacion);
  // Todas miden lo mismo; la caja la marca la foto más alta (la misma regla
  // que la vista previa).
  const altoFoto = dist.anchoCelda * proporcionDeCaja(imagenes);

  h.y += 4;
  for (const fila of dist.filas) {
    d.fontSize(7);
    const leyendas = fila.indices.map((i) => leyenda(imagenes[i]));
    const altoLeyenda = Math.max(
      ...leyendas.map((t) =>
        d.font('Helvetica').heightOfString(t, { width: dist.anchoCelda }),
      ),
    );
    // Foto y leyenda van juntas en la misma página.
    h.reservar(altoFoto + altoLeyenda + 6);
    fila.indices.forEach((i, k) => {
      const x = M + fila.desplazamiento + k * (dist.anchoCelda + separacion);
      h.imagen(imagenes[i], x, h.y, dist.anchoCelda, altoFoto);
      const foto = imagenes[i];
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
}

function recopilacion(h: Hoja, datos: DatosPdfReporte): void {
  h.barra('RECOPILACIÓN Y TABULACIÓN DE DATOS');
  const d = h.documento;
  grillaDeImagenes(h, datos.fotos, datos.reporte.fotos_por_fila);

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

  const r = datos.reporte;
  if (!r.medicion || r.antecedentes.componentes.length > 0) {
    tablaDePiezas(h, datos);
  }
  if (r.medicion) {
    const diagramas = datos.diagramas ?? [];
    if (diagramas.length > 0) {
      diagramasDeMedicion(h, diagramas);
    }
    tablaDeEspesores(h, r.medicion, r.fecha, r.antecedentes.medicion_anterior);
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
  if (datos.anexos?.length) {
    // La barra no queda sola al pie: va con la primera fila de imágenes.
    const dist = distribuirFotos(datos.anexos.length, r.fotos_por_fila, W, 8);
    h.reservar(10 + 4 + dist.anchoCelda * proporcionDeCaja(datos.anexos) + 16);
  }
  h.barra('ANEXOS');
  // Las imágenes que no entraron en la recopilación, con la misma grilla.
  if (datos.anexos?.length) {
    grillaDeImagenes(h, datos.anexos, r.fotos_por_fila);
    h.y += 2;
  }
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
