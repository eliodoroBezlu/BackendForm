import { Module } from '@nestjs/common';
import { BulkDownloadService } from './services/bulk-download.service';

/**
 * Módulo de utilidades transversales reutilizadas por varios dominios.
 * Actualmente solo expone `BulkDownloadService` (orquestación de ZIP para
 * descargas masivas), usado por inspection-herra-equipos, instances e
 * inspecciones-emergencia.
 */
@Module({
  providers: [BulkDownloadService],
  exports: [BulkDownloadService],
})
export class CommonModule {}
