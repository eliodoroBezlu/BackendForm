import { Test, TestingModule } from '@nestjs/testing';
import { QrGeneratorController } from './qr-generator.controller';
import { QrGeneratorService } from './qr-generator.service';

/**
 * Comprueba que QrGeneratorController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('QrGeneratorController', () => {
  let controller: QrGeneratorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrGeneratorController],
      providers: [{ provide: QrGeneratorService, useValue: {} }],
    }).compile();

    controller = module.get<QrGeneratorController>(QrGeneratorController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
