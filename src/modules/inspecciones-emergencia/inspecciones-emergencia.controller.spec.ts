import { Test, TestingModule } from '@nestjs/testing';
import { InspeccionesEmergenciaController } from './inspecciones-emergencia.controller';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { InspeccionesEmergenciaDocumentService } from './inspecciones-emergencia-document.service';
import { ExtintorService } from '../extintor/extintor.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

/**
 * Comprueba que InspeccionesEmergenciaController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InspeccionesEmergenciaController', () => {
  let controller: InspeccionesEmergenciaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspeccionesEmergenciaController],
      providers: [
        { provide: InspeccionesEmergenciaService, useValue: {} },
        { provide: InspeccionesEmergenciaDocumentService, useValue: {} },
        { provide: ExtintorService, useValue: {} },
        { provide: BulkDownloadService, useValue: {} },
      ],
    }).compile();

    controller = module.get<InspeccionesEmergenciaController>(
      InspeccionesEmergenciaController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
