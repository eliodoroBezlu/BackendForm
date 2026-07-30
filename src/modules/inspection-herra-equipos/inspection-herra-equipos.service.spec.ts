import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquipos } from './schemas/inspection-herra-equipos.schema';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';

/**
 * Comprueba que InspectionsHerraEquiposService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InspectionsHerraEquiposService', () => {
  let service: InspectionsHerraEquiposService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        { provide: getModelToken(InspectionHerraEquipos.name), useValue: {} },
        { provide: EquipmentTrackingService, useValue: {} },
        { provide: TemplateConfigService, useValue: {} },
        { provide: TemplateHerraEquiposService, useValue: {} },
      ],
    }).compile();

    service = module.get<InspectionsHerraEquiposService>(
      InspectionsHerraEquiposService,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
