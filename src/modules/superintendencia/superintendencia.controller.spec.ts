import { Test, TestingModule } from '@nestjs/testing';
import { SuperintendenciaController } from './superintendencia.controller';
import { SuperintendenciaService } from './superintendencia.service';

/**
 * Igual que en áreas: el usuario que firma la operación sale del token, no del
 * cuerpo de la petición.
 */
describe('SuperintendenciaController', () => {
  let controller: SuperintendenciaController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      buscarSuperintendencia: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      desactivar: jest.fn().mockResolvedValue({}),
      activar: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperintendenciaController],
      providers: [{ provide: SuperintendenciaService, useValue: servicio }],
    }).compile();

    controller = module.get<SuperintendenciaController>(
      SuperintendenciaController,
    );
  });

  const peticion = (username?: string) => ({ user: { username } }) as never;

  it('desactivar registra quien lo hizo', async () => {
    await controller.desactivar('id-1', peticion('jperez'));

    expect(servicio.desactivar).toHaveBeenCalledWith('id-1', 'jperez');
  });

  it('activar tambien', async () => {
    await controller.activar('id-1', peticion('jperez'));

    expect(servicio.activar).toHaveBeenCalledWith('id-1', 'jperez');
  });

  it('sin usuario en el token no se pierde la trazabilidad', async () => {
    await controller.desactivar('id-1', peticion());

    const [, usuario] = servicio.desactivar.mock.calls[0] as [string, string];
    expect(usuario).toBeTruthy();
  });

  it('la busqueda reenvia el termino', async () => {
    await controller.buscarSuperintendencias('mina');

    expect(servicio.buscarSuperintendencia).toHaveBeenCalledWith('mina');
  });
});
