import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TrabajadoresService } from './trabajadores.service';
import { Trabajador } from './schema/trabajador.schema';
import { User } from '../auth/schemas/user.schema';
import { ConfigService } from '@nestjs/config';

/**
 * Comprueba que TrabajadoresService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TrabajadoresService', () => {
  let service: TrabajadoresService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrabajadoresService,
        { provide: getModelToken(Trabajador.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<TrabajadoresService>(TrabajadoresService);
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
