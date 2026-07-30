import { Test, TestingModule } from '@nestjs/testing';
import { ExtintorController } from './extintor.controller';
import { ExtintorService } from './extintor.service';

/**
 * Comprueba que ExtintorController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('ExtintorController', () => {
  let controller: ExtintorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExtintorController],
      providers: [{ provide: ExtintorService, useValue: {} }],
    }).compile();

    controller = module.get<ExtintorController>(ExtintorController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
