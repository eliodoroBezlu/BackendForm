import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA } from '@nestjs/common/constants';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';

describe('TagController', () => {
  let controller: TagController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findByArea: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      desactivar: jest.fn().mockResolvedValue({}),
      activar: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagController],
      providers: [{ provide: TagService, useValue: servicio }],
    }).compile();

    controller = module.get<TagController>(TagController);
  });

  it('la busqueda por area toma el valor de la query', async () => {
    await controller.findTagByArea('Chancado');

    expect(servicio.findByArea).toHaveBeenCalledWith('Chancado');
  });

  it('update recibe primero el id y despues el cuerpo', async () => {
    // Ambos podrian intercambiarse sin que el compilador se queje si el DTO
    // fuese laxo; el orden es lo unico que los distingue.
    await controller.update('id-1', { area: 'Molienda' } as never);

    expect(servicio.update).toHaveBeenCalledWith('id-1', { area: 'Molienda' });
  });

  it('activar y desactivar son operaciones distintas de borrar', async () => {
    await controller.desactivar('id-1');
    await controller.activar('id-2');

    expect(servicio.desactivar).toHaveBeenCalledWith('id-1');
    expect(servicio.activar).toHaveBeenCalledWith('id-2');
    expect(servicio.remove).not.toHaveBeenCalled();
  });

  it('las rutas literales se declaran antes que «:id»', () => {
    const rutas = Object.getOwnPropertyNames(TagController.prototype)
      .filter((n) => n !== 'constructor')
      .map(
        (n) =>
          Reflect.getMetadata(
            PATH_METADATA,
            (TagController.prototype as unknown as Record<string, unknown>)[
              n
            ] as object,
          ) as string,
      )
      .filter((r) => typeof r === 'string');

    const posicionId = rutas.indexOf(':id');
    const literalesDespues = rutas
      .slice(posicionId + 1)
      .filter((r) => r !== '' && !r.startsWith(':') && !r.includes('/'));

    expect(literalesDespues).toEqual([]);
  });
});
