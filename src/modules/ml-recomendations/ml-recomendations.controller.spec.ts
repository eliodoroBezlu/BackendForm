import { Test, TestingModule } from '@nestjs/testing';
import { MLRecommendationsController } from './ml-recomendations.controller';
import { MLRecommendationsService } from './ml-recomendations.service';

describe('MlRecomendationsController', () => {
  let controller: MLRecommendationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MLRecommendationsController],
      providers: [MLRecommendationsService],
    }).compile();

    controller = module.get<MLRecommendationsController>(MLRecommendationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
