import { Injectable, Logger } from '@nestjs/common';
// `import PDFDocument from 'pdfkit'` compila pero **revienta en ejecución**: el
// tsconfig tiene `allowSyntheticDefaultImports` sin `esModuleInterop`, así que
// TypeScript acepta la sintaxis y emite `pdfkit_1.default`, que en un módulo
// CommonJS no existe. Ésta es la forma que sí resuelve al `module.exports`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  EntregaLinterna,
  EstadoEntrega,
  TipoEntrega,
} from './schemas/entrega-linterna.schema';
import { Firma } from '../../common/firma/firma.schema';

const ETIQUETA_TIPO: Record<TipoEntrega, string> = {
  [TipoEntrega.DOTACION]: 'DOTACIÓN',
  [TipoEntrega.CAMBIO]: 'CAMBIO',
  [TipoEntrega.REPOSICION_PERDIDA]: 'REPOSICIÓN POR PÉRDIDA',
};

const ETIQUETA_ESTADO: Record<EstadoEntrega, string> = {
  [EstadoEntrega.REGISTRADA]: 'Registrada',
  [EstadoEntrega.PENDIENTE_APROBACION]: 'Pendiente de aprobación',
  [EstadoEntrega.APROBADA]: 'Aprobada',
  [EstadoEntrega.RECHAZADA]: 'Rechazada',
};

const MARGEN = 50;
const ANCHO_UTIL = 595.28 - MARGEN * 2; // A4 vertical

@Injectable()
export class LinternasPdfService {
  private readonly logger = new Logger(LinternasPdfService.name);

  /**
   * Acta de entrega, el equivalente al papel que se archivaba.
   *
   * Se devuelve como Buffer y no como stream porque son una o dos páginas: el
   * streaming complica el manejo de errores sin ganar nada a este tamaño.
   */
  generarActa(entrega: EntregaLinterna): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGEN });
      const trozos: Buffer[] = [];

      doc.on('data', (t: Buffer) => trozos.push(t));
      doc.on('end', () => resolve(Buffer.concat(trozos)));
      doc.on('error', reject);

      try {
        this.cabecera(doc, entrega);
        this.datosTrabajador(doc, entrega);
        this.detalleDelActo(doc, entrega);
        this.firmas(doc, entrega);
        this.pie(doc, entrega);
        doc.end();
      } catch (error) {
        this.logger.error(
          `No se pudo generar el acta de ${String(entrega._id)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private cabecera(doc: PDFKit.PDFDocument, entrega: EntregaLinterna): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('ACTA DE ENTREGA DE LINTERNA', { align: 'center' })
      .moveDown(0.2);

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#444')
      .text(ETIQUETA_TIPO[entrega.tipo], { align: 'center' })
      .fillColor('#000')
      .moveDown(1);

    doc
      .moveTo(MARGEN, doc.y)
      .lineTo(MARGEN + ANCHO_UTIL, doc.y)
      .stroke('#ccc');
    doc.moveDown(1);
  }

  private datosTrabajador(
    doc: PDFKit.PDFDocument,
    entrega: EntregaLinterna,
  ): void {
    this.campo(doc, 'Trabajador', entrega.nombreTrabajador);
    this.campo(doc, 'Área', entrega.area);
    this.campo(doc, 'Superintendencia', entrega.superintendencia);
    this.campo(
      doc,
      'Fecha de entrega',
      entrega.fechaEntrega
        ? new Date(entrega.fechaEntrega).toLocaleDateString('es-BO')
        : 'Sin entregar',
    );
    this.campo(doc, 'Estado', ETIQUETA_ESTADO[entrega.estado]);
    this.campo(doc, 'Registrado por', entrega.registradoPor);
    doc.moveDown(0.5);
  }

  private detalleDelActo(
    doc: PDFKit.PDFDocument,
    entrega: EntregaLinterna,
  ): void {
    if (entrega.devolucion) {
      this.subtitulo(doc, 'Devolución de la linterna averiada');
      this.campo(
        doc,
        'Constancia fotográfica',
        entrega.devolucion.foto?.nombre ?? 'adjunta',
      );
      if (entrega.devolucion.observacion) {
        this.campo(doc, 'Observación', entrega.devolucion.observacion);
      }
      doc.moveDown(0.5);
    }

    if (entrega.perdida) {
      this.subtitulo(doc, 'Justificación de la pérdida');
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(entrega.perdida.justificacion, {
          width: ANCHO_UTIL,
          align: 'justify',
        })
        .moveDown(0.5);

      if (entrega.perdida.evidencias?.length) {
        this.campo(
          doc,
          'Evidencias',
          entrega.perdida.evidencias.map((e) => e.nombre).join(', '),
        );
      }
      if (entrega.perdida.aprobadoPor) {
        this.campo(doc, 'Autorizado por', entrega.perdida.aprobadoPor);
      }
      if (entrega.perdida.comentarioAprobador) {
        this.campo(doc, 'Comentario', entrega.perdida.comentarioAprobador);
      }
      doc.moveDown(0.5);
    }

    if (entrega.observacion) {
      this.campo(doc, 'Observación', entrega.observacion);
      doc.moveDown(0.5);
    }
  }

  private firmas(doc: PDFKit.PDFDocument, entrega: EntregaLinterna): void {
    const y = doc.y + 20;
    const anchoCaja = ANCHO_UTIL / 2 - 10;

    this.recuadroFirma(
      doc,
      MARGEN,
      y,
      anchoCaja,
      'Recibí conforme',
      entrega.nombreTrabajador,
      entrega.firmaTrabajador,
    );

    if (entrega.tipo === TipoEntrega.REPOSICION_PERDIDA) {
      this.recuadroFirma(
        doc,
        MARGEN + anchoCaja + 20,
        y,
        anchoCaja,
        'Autoriza',
        entrega.perdida?.aprobadoPor ?? '',
        entrega.perdida?.firmaAprobador,
      );
    }

    doc.y = y + 120;
  }

  private recuadroFirma(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    ancho: number,
    titulo: string,
    nombre: string,
    firma?: Firma,
  ): void {
    doc.rect(x, y, ancho, 100).stroke('#ccc');

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#666')
      .text(titulo.toUpperCase(), x + 6, y + 6, { width: ancho - 12 })
      .fillColor('#000');

    if (firma?.imagen) {
      try {
        // La firma viaja como data URL, igual que en las inspecciones.
        const base64 = firma.imagen.replace(/^data:image\/\w+;base64,/, '');
        doc.image(Buffer.from(base64, 'base64'), x + 10, y + 20, {
          fit: [ancho - 20, 50],
          align: 'center',
        });
      } catch {
        // Una firma ilegible no debe impedir imprimir el acta: se deja la
        // línea vacía, que es exactamente lo que muestra el papel sin firmar.
        this.logger.warn('Firma no renderizable en el acta; se omite.');
      }
    }

    doc
      .moveTo(x + 10, y + 76)
      .lineTo(x + ancho - 10, y + 76)
      .stroke('#999');

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(nombre || '—', x + 6, y + 80, {
        width: ancho - 12,
        align: 'center',
      });
  }

  /**
   * El pie lleva el hash de la firma. Es lo que permite comprobar después que
   * el acta impresa corresponde al registro digital sin alterar.
   */
  private pie(doc: PDFKit.PDFDocument, entrega: EntregaLinterna): void {
    doc.moveDown(1);
    doc
      .fontSize(7)
      .fillColor('#888')
      .text(`Registro: ${String(entrega._id)}`, MARGEN, doc.y, {
        width: ANCHO_UTIL,
      });

    if (entrega.firmaTrabajador?.hash) {
      doc.text(
        `Verificación de firma (SHA-256): ${entrega.firmaTrabajador.hash}`,
        { width: ANCHO_UTIL },
      );
      doc.text(
        `Firmada por ${entrega.firmaTrabajador.firmadoPor} el ` +
          `${new Date(entrega.firmaTrabajador.firmadoEn).toLocaleString('es-BO')} ` +
          `(${entrega.firmaTrabajador.metodo})`,
        { width: ANCHO_UTIL },
      );
    }
    doc.fillColor('#000');
  }

  private subtitulo(doc: PDFKit.PDFDocument, texto: string): void {
    doc.fontSize(11).font('Helvetica-Bold').text(texto).moveDown(0.3);
  }

  private campo(
    doc: PDFKit.PDFDocument,
    etiqueta: string,
    valor: string,
  ): void {
    doc.fontSize(10).font('Helvetica-Bold').text(`${etiqueta}: `, {
      continued: true,
    });
    doc.font('Helvetica').text(valor || '—');
  }
}
