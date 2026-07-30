import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { EquipmentInspectionTracking } from './schemas/equipment-tracking.schema';
import { TemplateConfigService } from './template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';
import { EquiposService } from '../equipos/equipos.service';

/**
 * Comprueba que EquipmentTrackingService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('EquipmentTrackingService', () => {
  let service: EquipmentTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquipmentTrackingService,
        {
          provide: getModelToken(EquipmentInspectionTracking.name),
          useValue: {},
        },
        { provide: TemplateConfigService, useValue: {} },
        { provide: TemplateHerraEquiposService, useValue: {} },
        { provide: EquiposService, useValue: {} },
      ],
    }).compile();

    service = module.get<EquipmentTrackingService>(EquipmentTrackingService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
