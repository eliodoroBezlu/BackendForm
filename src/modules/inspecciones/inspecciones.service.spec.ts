import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InspeccionesService } from './inspecciones.service';
import { Inspeccion } from './schemas/inspeccion.schema';

/**
 * Comprueba que InspeccionesService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('InspeccionesService', () => {
  let service: InspeccionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspeccionesService,
        { provide: getModelToken(Inspeccion.name), useValue: {} },
      ],
    }).compile();

    service = module.get<InspeccionesService>(InspeccionesService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
