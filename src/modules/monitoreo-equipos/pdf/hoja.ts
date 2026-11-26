/**
 * Lo común del dibujo del PDF de monitoreo: medidas de la hoja A4, colores del
 * formato y el ayudante `Hoja` (celdas, filas, barras, párrafos e imágenes con
 * un cursor vertical propio). Lo usan el reporte y la tabla de espesores.
 */

export interface ImagenParaPdf {
  /** `undefined` si el archivo ya no está: se dibuja un recuadro avisándolo. */
  contenido?: Buffer;
  descripcion: string;
  referencia: boolean;
  ancho?: number;
  alto?: number;
}

// ── Medidas y colores ─────────────────────────────────────────────────────

export const A4 = { ancho: 595.28, alto: 841.89 };
export const M = 28;
export const W = A4.ancho - M * 2;
/** Margen inferior más chico: lo que cabe en una hoja es lo que más se nota. */
export const M_INFERIOR = 18;
/** Por debajo de esto va el «Página x de y». */
export const LIMITE = A4.alto - M_INFERIOR - 12;

export const C = {
  borde: '#7F7F7F',
  barra: '#D9D9D9',
  azulOscuro: '#1F3864',
  azul: '#2E75B6',
  interna: '#9DC3E6',
  negro: '#000000',
  /** Un espesor por debajo del de alerta. */
  rojo: '#C00000',
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
export const num = (n?: number): string =>
  n === undefined || n === null ? '' : String(n).replace('.', ',');

/** Texto claro sobre un fondo oscuro, como INTERVENCIÓN INMEDIATA en rojo. */
export function textoSobre(fondo?: string): string {
  if (!fondo || !/^#[0-9a-f]{6}$/i.test(fondo)) return C.texto;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fondo.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? '#FFFFFF' : C.texto;
}

export interface Estilo {
  negrita?: boolean;
  tamano?: number;
  fondo?: string;
  color?: string;
  alinear?: 'left' | 'center' | 'right';
  borde?: boolean;
}

/** Ayudante de dibujo: celdas, barras y párrafos con un cursor vertical propio. */
export class Hoja {
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
