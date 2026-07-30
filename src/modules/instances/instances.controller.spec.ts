import { Test, TestingModule } from '@nestjs/testing';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { InstancesDocumentService } from './instances-document.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

/**
 * Comprueba que InstancesController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InstancesController', () => {
  let controller: InstancesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstancesController],
      providers: [
        { provide: InstancesService, useValue: {} },
        { provide: InstancesDocumentService, useValue: {} },
        { provide: BulkDownloadService, useValue: {} },
      ],
    }).compile();

    controller = module.get<InstancesController>(InstancesController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
