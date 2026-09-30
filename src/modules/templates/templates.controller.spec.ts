import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA } from '@nestjs/common/constants';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/**
 * `code/:code` y `stats` tienen que declararse antes de `:id`, o quedan
 * inalcanzables. El código lo avisa con un comentario; aquí se comprueba.
 */
describe('TemplatesController', () => {
  let controller: TemplatesController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      findByCode: jest.fn().mockResolvedValue({}),
      getStats: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      desactivate: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [{ provide: TemplatesService, useValue: servicio }],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
  });

  const rutas = () =>
    Object.getOwnPropertyNames(TemplatesController.prototype)
      .filter((n) => n !== 'constructor')
      .map((n) => ({
        metodo: n,
        ruta: Reflect.getMetadata(
          PATH_METADATA,
          (TemplatesController.prototype as unknown as Record<string, unknown>)[
            n
          ] as object,
        ) as string,
      }))
      .filter((r) => typeof r.ruta === 'string');

  describe('orden de las rutas', () => {
    it.each(['code/:code', 'stats'])('«%s» va antes que «:id»', (ruta) => {
      const lista = rutas();
      const posicion = lista.findIndex((r) => r.ruta === ruta);
      const posicionId = lista.findIndex((r) => r.ruta === ':id');

      expect(posicion).toBeGreaterThan(-1);
      expect(posicion).toBeLessThan(posicionId);
    });
  });

  describe('paso de parametros', () => {
    it('findAll agrupa los tres filtros en un objeto', async () => {
      await controller.findAll('interna', true, 'arnes');

      expect(servicio.findAll).toHaveBeenCalledWith({
        type: 'interna',
        isActive: true,
        search: 'arnes',
        incluirBorradores: false,
      });
    });

    it('sin filtros pasa el objeto con los campos vacios', async () => {
      await controller.findAll();

      expect(servicio.findAll).toHaveBeenCalledWith({
        type: undefined,
        isActive: undefined,
        search: undefined,
        incluirBorradores: false,
      });
    });

    it('findByCode consulta por codigo, no por id', async () => {
      await controller.findByCode('1.02.P06.F19');

      expect(servicio.findByCode).toHaveBeenCalledWith('1.02.P06.F19');
      expect(servicio.findOne).not.toHaveBeenCalled();
    });

    it('desactivar no es lo mismo que borrar', async () => {
      // Son dos rutas distintas y no deben confundirse: una conserva la
      // plantilla y sus inspecciones; la otra la elimina.
      await controller.desactivate('id-1');

      expect(servicio.desactivate).toHaveBeenCalledWith('id-1');
      expect(servicio.remove).not.toHaveBeenCalled();
    });
  });
});
