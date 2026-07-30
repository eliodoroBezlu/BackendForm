import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InstancesService } from './instances.service';
import { Instance } from './schemas/instance.schema';
import { TemplatesService } from '../templates/templates.service';

/**
 * Comprueba que InstancesService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InstancesService', () => {
  let service: InstancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstancesService,
        { provide: getModelToken(Instance.name), useValue: {} },
        { provide: TemplatesService, useValue: {} },
      ],
    }).compile();

    service = module.get<InstancesService>(InstancesService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
