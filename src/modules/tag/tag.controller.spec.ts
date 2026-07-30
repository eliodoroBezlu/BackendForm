import { Test, TestingModule } from '@nestjs/testing';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';

/**
 * Comprueba que TagController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TagController', () => {
  let controller: TagController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagController],
      providers: [{ provide: TagService, useValue: {} }],
    }).compile();

    controller = module.get<TagController>(TagController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
