import { Test, TestingModule } from '@nestjs/testing';
import { MLRecommendationsController } from './ml-recomendations.controller';
import { MLRecommendationsService } from './ml-recomendations.service';

/**
 * Comprueba que MLRecommendationsController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('MLRecommendationsController', () => {
  let controller: MLRecommendationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MLRecommendationsController],
      providers: [{ provide: MLRecommendationsService, useValue: {} }],
    }).compile();

    controller = module.get<MLRecommendationsController>(
      MLRecommendationsController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
