import { Test, TestingModule } from '@nestjs/testing';
import { PlanesAccionController } from './planes-accion.controller';
import { PlanesAccionService } from './planes-accion.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';

/**
 * Comprueba que PlanesAccionController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('PlanesAccionController', () => {
  let controller: PlanesAccionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanesAccionController],
      providers: [
        { provide: PlanesAccionService, useValue: {} },
        { provide: PlanesAccionExcelService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PlanesAccionController>(PlanesAccionController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
