import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PlanesAccionService } from './planes-accion.service';
import { PlanDeAccion } from './schemas/plan-accion.schema';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';
import { ConfigService } from '@nestjs/config';

/**
 * Comprueba que PlanesAccionService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('PlanesAccionService', () => {
  let service: PlanesAccionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesAccionService,
        { provide: getModelToken(PlanDeAccion.name), useValue: {} },
        { provide: InstancesService, useValue: {} },
        { provide: TemplatesService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<PlanesAccionService>(PlanesAccionService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
