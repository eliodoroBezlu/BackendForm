import { Test, TestingModule } from '@nestjs/testing';
import { QrGeneratorService } from './qr-generator.service';

describe('QrGeneratorService', () => {
  let service: QrGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QrGeneratorService],
    }).compile();

    service = module.get<QrGeneratorService>(QrGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
