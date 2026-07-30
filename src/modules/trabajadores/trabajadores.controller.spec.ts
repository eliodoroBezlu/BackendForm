import { Test, TestingModule } from '@nestjs/testing';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';

/**
 * Comprueba que TrabajadoresController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TrabajadoresController', () => {
  let controller: TrabajadoresController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrabajadoresController],
      providers: [{ provide: TrabajadoresService, useValue: {} }],
    }).compile();

    controller = module.get<TrabajadoresController>(TrabajadoresController);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
