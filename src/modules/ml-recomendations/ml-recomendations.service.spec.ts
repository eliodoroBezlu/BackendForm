import { Test, TestingModule } from '@nestjs/testing';
import { MLRecommendationsService } from './ml-recomendations.service';
import { InstancesService } from '../instances/instances.service';
import { ConfigService } from '@nestjs/config';

/**
 * Comprueba que MLRecommendationsService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('MLRecommendationsService', () => {
  let service: MLRecommendationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MLRecommendationsService,
        { provide: InstancesService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<MLRecommendationsService>(MLRecommendationsService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
