import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentTrackingController } from './equipment-tracking.controller';
import { EquipmentTrackingService } from './equipment-tracking.service';

describe('EquipmentTrackingController', () => {
  let controller: EquipmentTrackingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EquipmentTrackingController],
      providers: [EquipmentTrackingService],
    }).compile();

    controller = module.get<EquipmentTrackingController>(EquipmentTrackingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
