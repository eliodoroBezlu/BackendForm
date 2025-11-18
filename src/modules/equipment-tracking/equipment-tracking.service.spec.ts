import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentTrackingService } from './equipment-tracking.service';

describe('EquipmentTrackingService', () => {
  let service: EquipmentTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EquipmentTrackingService],
    }).compile();

    service = module.get<EquipmentTrackingService>(EquipmentTrackingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
