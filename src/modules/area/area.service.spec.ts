import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AreaService } from './area.service';
import { Area } from './schema/area.schema';
import { Superintendencia } from '../superintendencia/schema/superintendencia.schema';
import { ConfigService } from '@nestjs/config';

/**
 * Comprueba que AreaService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('AreaService', () => {
  let service: AreaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreaService,
        { provide: getModelToken(Area.name), useValue: {} },
        { provide: getModelToken(Superintendencia.name), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AreaService>(AreaService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
