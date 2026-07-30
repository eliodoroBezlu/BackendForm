import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ExtintorService } from './extintor.service';
import { Extintor } from './schema/extintor.schema';

/**
 * Comprueba que ExtintorService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('ExtintorService', () => {
  let service: ExtintorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtintorService,
        { provide: getModelToken(Extintor.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ExtintorService>(ExtintorService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
