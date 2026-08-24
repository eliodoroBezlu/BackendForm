import { Test, TestingModule } from '@nestjs/testing';
import { AreaController } from './area.controller';
import { AreaService } from './area.service';

/**
 * El controlador aporta una cosa que el servicio no ve: **de dónde sale el
 * usuario que firma la operación**. Se toma del token, no del cuerpo de la
 * petición — si viniera del cuerpo, cualquiera podría atribuir un cambio a
 * otra persona.
 */
describe('AreaController', () => {
  let controller: AreaController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      desactivar: jest.fn().mockResolvedValue({}),
      activar: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      buscarArea: jest.fn().mockResolvedValue([]),
      syncAreasFromIam: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AreaController],
      providers: [{ provide: AreaService, useValue: servicio }],
    }).compile();

    controller = module.get<AreaController>(AreaController);
  });

  const peticion = (username?: string) => ({ user: { username } }) as never;

  describe('quien firma la operacion', () => {
    it('el usuario sale del token, no del cuerpo', async () => {
      await controller.create(
        { nombre: 'Chancado', creadoPor: 'usuario-falseado' } as never,
        peticion('jperez'),
      );

      expect(servicio.create).toHaveBeenCalledWith(expect.anything(), 'jperez');
    });

    it('sin usuario en el token se registra «Sistema»', async () => {
      // Ocurre en llamadas internas. Dejar el campo vacio perderia la
      // trazabilidad de quien creo el area.
      await controller.create({ nombre: 'Chancado' } as never, peticion());

      expect(servicio.create).toHaveBeenCalledWith(
        expect.anything(),
        'Sistema',
      );
    });

    it('activar y desactivar tambien registran al usuario', async () => {
      await controller.desactivar('id-1', peticion('jperez'));
      await controller.activar('id-1', peticion('jperez'));

      expect(servicio.desactivar).toHaveBeenCalledWith('id-1', 'jperez');
      expect(servicio.activar).toHaveBeenCalledWith('id-1', 'jperez');
    });
  });

  describe('paso de parametros', () => {
    it('update recibe id, cuerpo y usuario en ese orden', async () => {
      await controller.update(
        'id-1',
        { nombre: 'Nuevo' } as never,
        peticion('jperez'),
      );

      expect(servicio.update).toHaveBeenCalledWith(
        'id-1',
        { nombre: 'Nuevo' },
        'jperez',
      );
    });

    it('la busqueda reenvia el termino tal cual', async () => {
      await controller.buscarAreas('chan');

      expect(servicio.buscarArea).toHaveBeenCalledWith('chan');
    });
  });
});
