import { Test, TestingModule } from '@nestjs/testing';
import { QrGeneratorService } from './qr-generator.service';

/**
 * Comprueba que QrGeneratorService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('QrGeneratorService', () => {
  let service: QrGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QrGeneratorService],
    }).compile();

    service = module.get<QrGeneratorService>(QrGeneratorService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
