import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentTrackingController } from './equipment-tracking.controller';
import { EquipmentTrackingService } from './equipment-tracking.service';

/**
 * Comprueba que EquipmentTrackingController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('EquipmentTrackingController', () => {
  let controller: EquipmentTrackingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EquipmentTrackingController],
      providers: [{ provide: EquipmentTrackingService, useValue: {} }],
    }).compile();

    controller = module.get<EquipmentTrackingController>(
      EquipmentTrackingController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
