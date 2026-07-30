import { Test, TestingModule } from '@nestjs/testing';
import { InspeccionesController } from './inspecciones.controller';
import { InspeccionesService } from './inspecciones.service';
import { ExcelService } from '../excel/excel.service';

/**
 * Comprueba que InspeccionesController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InspeccionesController', () => {
  let controller: InspeccionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspeccionesController],
      providers: [
        { provide: InspeccionesService, useValue: {} },
        { provide: ExcelService, useValue: {} },
      ],
    }).compile();

    controller = module.get<InspeccionesController>(InspeccionesController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
