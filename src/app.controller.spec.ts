import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Comprueba que AppController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: {} }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
