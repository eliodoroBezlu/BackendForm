import { Test, TestingModule } from '@nestjs/testing';
import { ExtintorController } from './extintor.controller';
import { ExtintorService } from './extintor.service';

/**
 * Los filtros llegan por la URL como cadenas y hay que convertirlos a
 * booleanos. Es el punto donde `"false"` puede acabar valiendo `true` —toda
 * cadena no vacía lo es— y el listado devolvería justo lo contrario de lo
 * pedido.
 */
describe('ExtintorController · conversión de filtros', () => {
  let controller: ExtintorController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findWithFilters: jest.fn().mockResolvedValue([]),
      findByTag: jest
        .fn()
        .mockResolvedValue({ extintores: [], totalActivosArea: 0 }),
      findByArea: jest
        .fn()
        .mockResolvedValue({ extintores: [], totalActivosArea: 0 }),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      desactivarExtintor: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExtintorController],
      providers: [{ provide: ExtintorService, useValue: servicio }],
    }).compile();

    controller = module.get<ExtintorController>(ExtintorController);
  });

  const filtrosUsados = () =>
    servicio.findWithFilters.mock.calls[0][0] as Record<string, unknown>;

  it('«true» se convierte en booleano verdadero', async () => {
    await controller.findWithFilters(undefined, undefined, undefined, 'true');

    expect(filtrosUsados().activo).toBe(true);
  });

  it('«false» se convierte en booleano FALSO, no en true', async () => {
    // El fallo clasico: `Boolean('false')` es `true`. Si eso pasara, pedir los
    // extintores dados de baja devolveria los activos.
    await controller.findWithFilters(undefined, undefined, undefined, 'false');

    expect(filtrosUsados().activo).toBe(false);
  });

  it('un filtro ausente queda undefined, no false', async () => {
    // `undefined` significa «no filtres»; `false` significa «solo los
    // inactivos». Confundirlos cambia el listado por completo.
    await controller.findWithFilters();

    expect(filtrosUsados().activo).toBeUndefined();
    expect(filtrosUsados().inspeccionado).toBeUndefined();
  });

  it('los dos filtros booleanos se convierten igual', async () => {
    await controller.findWithFilters(
      undefined,
      undefined,
      undefined,
      'true',
      'false',
    );

    expect(filtrosUsados().activo).toBe(true);
    expect(filtrosUsados().inspeccionado).toBe(false);
  });

  it('los filtros de texto pasan tal cual', async () => {
    await controller.findWithFilters('Chancado', 'TAG-01', 'EXT-9');

    expect(filtrosUsados()).toMatchObject({
      area: 'Chancado',
      tag: 'TAG-01',
      codigo: 'EXT-9',
    });
  });

  it('buscar por tag y por area son rutas distintas', async () => {
    await controller.findByTag('TAG-01');
    await controller.findByArea('Chancado');

    expect(servicio.findByTag).toHaveBeenCalledWith('TAG-01');
    expect(servicio.findByArea).toHaveBeenCalledWith('Chancado');
  });
});
