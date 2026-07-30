import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SuperintendenciaService } from './superintendencia.service';
import { Superintendencia } from './schema/superintendencia.schema';

/**
 * Comprueba que SuperintendenciaService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('SuperintendenciaService', () => {
  let service: SuperintendenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperintendenciaService,
        { provide: getModelToken(Superintendencia.name), useValue: {} },
      ],
    }).compile();

    service = module.get<SuperintendenciaService>(SuperintendenciaService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
