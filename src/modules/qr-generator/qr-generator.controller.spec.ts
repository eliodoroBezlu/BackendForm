import { Test, TestingModule } from '@nestjs/testing';
import { QrGeneratorController } from './qr-generator.controller';
import { QrGeneratorService } from './qr-generator.service';

describe('QrGeneratorController', () => {
  let controller: QrGeneratorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrGeneratorController],
      providers: [QrGeneratorService],
    }).compile();

    controller = module.get<QrGeneratorController>(QrGeneratorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
