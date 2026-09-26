import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { SolicitudPrestamo } from './schemas/solicitud-prestamo.schema';
import { PrestamoSpcc } from './schemas/prestamo-spcc.schema';
import { AREA_PRESTADORA, ETIQUETA_TIPO } from './constantes';

const fecha = (d?: Date | string) =>
  d ? new Date(d).toLocaleDateString('es-BO') : '—';

/**
 * Acta del préstamo.
 *
 * `import PDFDocument = require('pdfkit')` y no un import por defecto: el
 * proyecto tiene `allowSyntheticDefaultImports` sin `esModuleInterop`, así que
 * la forma corta compila pero revienta en ejecución con «no es un constructor».
 */
@Injectable()
export class PrestamosPdfService {
  async generarActa(
    solicitud: SolicitudPrestamo,
    items: PrestamoSpcc[],
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));

    const listo = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(trozos)));
    });

    doc
      .fontSize(15)
      .font('Helvetica-Bold')
      .text('ACTA DE PRÉSTAMO DE SPCC', { align: 'center' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text('Sistemas de protección contra caídas', { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(12).font('Helvetica-Bold').text(solicitud.numero);
    doc.moveDown(0.5);

    const datos: [string, string][] = [
      ['Presta', AREA_PRESTADORA],
      ['Área solicitante', solicitud.areaSolicitante],
      [
        'Solicitante',
        solicitud.solicitanteNombre ?? solicitud.solicitanteUsername,
      ],
      ['Fecha de solicitud', fecha(solicitud.fechaSolicitud)],
      [
        'Periodo del préstamo',
        `${fecha(solicitud.fechaInicioPrevista ?? solicitud.fechaSolicitud)} — ${fecha(
          solicitud.fechaDevolucionPrevista,
        )}`,
      ],
      ['Estado', solicitud.estado],
    ];
    if (solicitud.entrega) {
      datos.push(['Entregado el', fecha(solicitud.entrega.fecha)]);
      datos.push(['Entregado por', solicitud.entrega.entregadoPor]);
    }

    doc.fontSize(9).font('Helvetica');
    for (const [etiqueta, valor] of datos) {
      doc.font('Helvetica-Bold').text(`${etiqueta}: `, { continued: true });
      doc.font('Helvetica').text(valor);
    }

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Motivo: ', { continued: true });
    doc.font('Helvetica').text(solicitud.motivo);

    // Lo pedido se imprime aparte de lo entregado: el acta debe dejar ver
    // que se pidieron tres arneses y salieron dos, que es justo la
    // discrepancia que alguien querrá reclamar después.
    if (solicitud.solicitado?.length) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').text('Solicitado: ', { continued: true });
      doc
        .font('Helvetica')
        .text(
          solicitud.solicitado
            .map(
              (l) =>
                `${l.cantidad} × ${ETIQUETA_TIPO[l.tipoEquipo] ?? l.tipoEquipo}`,
            )
            .join(' · '),
        );
    }

    doc.moveDown(1);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(
        items.length > 0
          ? `Equipos entregados (${items.length})`
          : 'Equipos entregados (pendiente de entrega)',
      );
    doc.moveDown(0.4);

    const y0 = doc.y;
    const cols = [50, 150, 330, 420];
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Código', cols[0], y0);
    doc.text('Descripción', cols[1], y0);
    doc.text('Estado', cols[2], y0);
    doc.text('Devuelto', cols[3], y0);
    doc
      .moveTo(45, doc.y + 2)
      .lineTo(550, doc.y + 2)
      .stroke();
    doc.moveDown(0.5);

    doc.fontSize(8).font('Helvetica');
    for (const item of items) {
      const y = doc.y;
      if (y > 720) {
        doc.addPage();
      }
      const fila = doc.y;
      doc.text(item.codigo, cols[0], fila, { width: 95 });
      doc.text(item.descripcion.slice(0, 45), cols[1], fila, { width: 175 });
      doc.text(item.estado, cols[2], fila, { width: 85 });
      doc.text(
        item.devolucion
          ? `${fecha(item.devolucion.fecha)} · ${item.devolucion.estado}`
          : '—',
        cols[3],
        fila,
        { width: 130 },
      );
      doc.moveDown(0.7);
    }

    // Firmas selladas: se dibuja la imagen si la hay, y siempre la línea.
    doc.moveDown(2);
    const yFirmas = Math.min(doc.y, 660);
    const firmas: [string, string | undefined][] = [
      ['Entrega', solicitud.entrega?.firmaEntrega?.imagen],
      ['Recibe', solicitud.entrega?.firmaReceptor?.imagen],
    ];

    firmas.forEach(([titulo, imagen], i) => {
      const x = 70 + i * 250;
      if (imagen?.startsWith('data:image')) {
        try {
          doc.image(Buffer.from(imagen.split(',')[1], 'base64'), x, yFirmas, {
            fit: [160, 55],
          });
        } catch {
          // Una firma ilegible no debe impedir que salga el acta.
        }
      }
      doc
        .moveTo(x, yFirmas + 62)
        .lineTo(x + 175, yFirmas + 62)
        .stroke();
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(titulo, x, yFirmas + 66);
    });

    /**
     * Correcciones posteriores a la firma.
     *
     * El sello de las firmas es un hash sobre la imagen, no sobre el
     * contenido: corregir el solicitante no rompe ningún hash, así que el acta
     * pasaría a decir algo distinto de lo que se firmó **sin que nada lo
     * delatara**. Esto es lo que permite a quien tenga una copia impresa vieja
     * entender por qué no coincide.
     */
    const correcciones = solicitud.correcciones ?? [];
    if (correcciones.length > 0) {
      doc.moveDown(1);
      doc.fontSize(7).fillColor('#a00').text('Correcciones posteriores:');
      correcciones.forEach((c) => {
        doc
          .fontSize(6)
          .fillColor('#a00')
          .text(
            `· ${c.campo}: antes decía «${c.valorAnterior ?? '—'}». ` +
              `Corregido por ${c.corregidoPor} el ${fecha(c.fecha)}. ` +
              `Motivo: ${c.motivo}`,
            { width: 505 },
          );
      });
      doc.fillColor('#000');
    }

    // Huella de las firmas, para poder comprobar después que no cambiaron.
    const hashes = [
      solicitud.entrega?.firmaEntrega?.hash,
      solicitud.entrega?.firmaReceptor?.hash,
    ].filter(Boolean);
    if (hashes.length > 0) {
      doc
        .fontSize(6)
        .fillColor('#666')
        .text(`SHA-256: ${hashes.join(' · ')}`, 45, 780, { width: 505 });
    }

    doc.end();
    return listo;
  }
}
