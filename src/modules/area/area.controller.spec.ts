import { Test, TestingModule } from '@nestjs/testing';
import { AreaController } from './area.controller';
import { AreaService } from './area.service';

/**
 * Comprueba que AreaController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('AreaController', () => {
  let controller: AreaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AreaController],
      providers: [{ provide: AreaService, useValue: {} }],
    }).compile();

    controller = module.get<AreaController>(AreaController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
