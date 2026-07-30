import { Test, TestingModule } from '@nestjs/testing';
import { SuperintendenciaController } from './superintendencia.controller';
import { SuperintendenciaService } from './superintendencia.service';

/**
 * Comprueba que SuperintendenciaController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('SuperintendenciaController', () => {
  let controller: SuperintendenciaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperintendenciaController],
      providers: [{ provide: SuperintendenciaService, useValue: {} }],
    }).compile();

    controller = module.get<SuperintendenciaController>(
      SuperintendenciaController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
