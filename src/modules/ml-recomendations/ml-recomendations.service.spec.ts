import { Test, TestingModule } from '@nestjs/testing';
import { MLRecommendationsService } from './ml-recomendations.service';

describe('MlRecomendationsService', () => {
  let service: MLRecommendationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MLRecommendationsService],
    }).compile();

    service = module.get<MLRecommendationsService>(MLRecommendationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
