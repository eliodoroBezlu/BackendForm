import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsHerraEquiposController } from './inspection-herra-equipos.controller';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquiposDocumentService } from './inspection-herra-equipos-document.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

/**
 * Comprueba que InspectionsHerraEquiposController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InspectionsHerraEquiposController', () => {
  let controller: InspectionsHerraEquiposController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspectionsHerraEquiposController],
      providers: [
        { provide: InspectionsHerraEquiposService, useValue: {} },
        { provide: InspectionHerraEquiposDocumentService, useValue: {} },
        { provide: BulkDownloadService, useValue: {} },
      ],
    }).compile();

    controller = module.get<InspectionsHerraEquiposController>(
      InspectionsHerraEquiposController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
