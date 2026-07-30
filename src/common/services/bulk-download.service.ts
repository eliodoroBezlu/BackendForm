import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import type { Readable } from 'stream';
import archiver = require('archiver');
import {
  buildContentDispositionHeader,
  dedupeFilename,
} from '../utils/download-filename.util';

export type BulkDownloadFormat = 'pdf' | 'excel';

export interface BulkDownloadItem {
  content: Buffer | Readable;
  filename: string;
}

/**
 * Resuelve el contenido (buffer/stream) y el nombre de archivo de UN
 * elemento del lote. Cada módulo (inspection-herra-equipos, instances,
 * inspecciones-emergencia) provee su propia implementación — es aquí donde
 * viven las diferencias específicas de cada dominio (qué servicio de
 * generación usar, cómo resolver los campos del nombre de archivo, etc).
 * Devolver `null` hace que el id se omita silenciosamente del ZIP.
 */
export type BulkDownloadItemResolver = (
  id: string,
  format: BulkDownloadFormat,
) => Promise<BulkDownloadItem | null>;

/**
 * Orquesta la construcción de un ZIP a partir de una lista de ids,
 * delegando en `resolveItem` la obtención del contenido de cada elemento.
 * Encapsula lo que era código idéntico (configuración de `archiver`, manejo
 * de errores, deduplicación de nombres) triplicado entre los controladores
 * de inspection-herra-equipos, instances e inspecciones-emergencia.
 */
@Injectable()
export class BulkDownloadService {
  private readonly logger = new Logger(BulkDownloadService.name);

  async streamZip(
    res: Response,
    ids: string[],
    format: BulkDownloadFormat,
    resolveItem: BulkDownloadItemResolver,
    zipBaseName = 'Inspecciones',
  ): Promise<void> {
    const zipFilename = `${zipBaseName}_${new Date().toISOString().slice(0, 10)}.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDispositionHeader(zipFilename),
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      this.logger.error('Error generando ZIP', err as Error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ success: false, message: 'Error al generar el ZIP' });
      }
    });
    archive.pipe(res);

    const usados = new Map<string, number>();

    for (const id of ids) {
      try {
        const item = await resolveItem(id, format);
        if (!item) continue;

        archive.append(item.content, {
          name: dedupeFilename(item.filename, usados),
        });
      } catch (err) {
        this.logger.error(
          `Error procesando id ${id} para el ZIP`,
          err as Error,
        );
      }
    }

    await archive.finalize();
  }
}
