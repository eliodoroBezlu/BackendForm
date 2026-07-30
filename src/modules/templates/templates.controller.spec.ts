import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/**
 * Comprueba que TemplatesController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TemplatesController', () => {
  let controller: TemplatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [{ provide: TemplatesService, useValue: {} }],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
