import { Test, TestingModule } from '@nestjs/testing';
import { ExtintorController } from './extintor.controller';
import { ExtintorService } from './extintor.service';

describe('ExtintorController', () => {
  let controller: ExtintorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExtintorController],
      providers: [ExtintorService],
    }).compile();

    controller = module.get<ExtintorController>(ExtintorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
