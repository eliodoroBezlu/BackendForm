import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Dos cosas que se rompen sin que nada avise y que aquí quedan fijadas:
 *
 * 1. **El orden de las rutas.** `@Get(':id')` captura cualquier cadena, así que
 *    tiene que declararse **después** de `completos`, `buscar` y
 *    `by-username/:username`. Si alguien reordena los métodos —o añade uno
 *    nuevo debajo— esas rutas dejan de existir: pasan a interpretarse como un
 *    identificador y responden 404 o 500. El código lo avisa con comentarios,
 *    pero un comentario no falla cuando se incumple.
 *
 * 2. **Quién puede llamar a qué.** Las altas y bajas son solo de admin.
 */
describe('TrabajadoresController', () => {
  let controller: TrabajadoresController;
  let servicio: Record<string, jest.Mock>;
  const reflector = new Reflector();

  beforeEach(async () => {
    servicio = {
      create: jest.fn(),
      createWithUser: jest.fn(),
      syncTrabajadoresFromIam: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findAllNames: jest.fn().mockResolvedValue([]),
      findAllCompletos: jest.fn().mockResolvedValue([]),
      buscarTrabajadores: jest.fn().mockResolvedValue([]),
      buscarTrabajadoresNames: jest.fn().mockResolvedValue([]),
      findByUsername: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrabajadoresController],
      providers: [{ provide: TrabajadoresService, useValue: servicio }],
    }).compile();

    controller = module.get<TrabajadoresController>(TrabajadoresController);
  });

  /** Rutas en el orden en que están declaradas en la clase. */
  const rutasEnOrden = (): { metodo: string; ruta: string }[] =>
    Object.getOwnPropertyNames(TrabajadoresController.prototype)
      .filter((nombre) => nombre !== 'constructor')
      .map((nombre) => ({
        metodo: nombre,
        ruta: Reflect.getMetadata(
          PATH_METADATA,
          (
            TrabajadoresController.prototype as unknown as Record<
              string,
              unknown
            >
          )[nombre] as object,
        ) as string,
      }))
      .filter((r) => typeof r.ruta === 'string');

  describe('orden de las rutas', () => {
    it('«:id» se declara al final de todas las rutas literales', () => {
      const rutas = rutasEnOrden();
      const posicionId = rutas.findIndex((r) => r.ruta === ':id');

      expect(posicionId).toBeGreaterThan(-1);

      const literalesDespues = rutas
        .slice(posicionId + 1)
        .filter((r) => !r.ruta.startsWith(':') && r.ruta !== '');

      // Cualquier ruta literal declarada después de «:id» es inalcanzable.
      expect(literalesDespues).toEqual([]);
    });

    it.each(['completos', 'buscar', 'nombres/all', 'buscar/autocomplete'])(
      '«%s» se declara antes que «:id»',
      (ruta) => {
        const rutas = rutasEnOrden();
        const posicion = rutas.findIndex((r) => r.ruta === ruta);
        const posicionId = rutas.findIndex((r) => r.ruta === ':id');

        expect(posicion).toBeGreaterThan(-1);
        expect(posicion).toBeLessThan(posicionId);
      },
    );

    it('«by-username/:username» tambien va antes', () => {
      const rutas = rutasEnOrden();
      const posicion = rutas.findIndex((r) => r.ruta.startsWith('by-username'));
      const posicionId = rutas.findIndex((r) => r.ruta === ':id');

      expect(posicion).toBeLessThan(posicionId);
    });
  });

  describe('quien puede hacer que', () => {
    const rolesDe = (metodo: keyof TrabajadoresController) =>
      reflector.get<string[]>(ROLES_KEY, controller[metodo] as never) ?? [];

    it('crear un trabajador es solo de admin', () => {
      expect(rolesDe('create')).toEqual([Role.ADMIN]);
    });

    it('lanzar la sincronizacion con IAM es solo de admin', () => {
      // Reescribe el roster completo: no es una operacion de consulta.
      expect(rolesDe('sync')).toEqual([Role.ADMIN]);
    });

    it('consultar el listado lo pueden varios roles operativos', () => {
      const roles = rolesDe('findAll');

      expect(roles).toContain(Role.SUPERVISOR);
      expect(roles).toContain(Role.INSPECTOR);
    });

    it('toda ruta declara explicitamente sus roles', () => {
      const sinRoles = rutasEnOrden().filter(
        ({ metodo }) =>
          rolesDe(metodo as keyof TrabajadoresController).length === 0,
      );

      expect(sinRoles).toEqual([]);
    });
  });

  describe('paso de parametros', () => {
    it('la busqueda reenvia el termino tal cual', async () => {
      await controller.buscarTrabajadores('perez');

      expect(servicio.buscarTrabajadores).toHaveBeenCalledWith('perez');
    });

    it('by-username reenvia el username, no el id', async () => {
      await controller.findByUsername('jperez');

      expect(servicio.findByUsername).toHaveBeenCalledWith('jperez');
      expect(servicio.findOne).not.toHaveBeenCalled();
    });
  });
});
