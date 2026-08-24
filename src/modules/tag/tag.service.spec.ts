import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TagService } from './tag.service';
import { OrdenTrabajo } from './schemas/tag.schema';

/**
 * Los TAG son las órdenes de trabajo con las que se identifican las
 * inspecciones. Que no se dupliquen y que lleguen limpios de espacios importa:
 * un TAG con un espacio al final es, para Mongo, un TAG distinto.
 */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'select', 'sort', 'limit', 'lean'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('TagService', () => {
  let servicio: TagService;
  let guardado: Record<string, unknown>;

  const construir = async (existente: unknown, resultado: unknown = []) => {
    const consulta = cadena(resultado);

    const Modelo = function (this: unknown, datos: never) {
      Object.assign(this as object, datos);
      guardado = datos as unknown as Record<string, unknown>;
      (this as { save: () => unknown }).save = () => Promise.resolve(datos);
    } as unknown as new (d: unknown) => unknown;

    Object.assign(Modelo, consulta);
    (Modelo as unknown as Record<string, jest.Mock>).findOne = jest.fn(() =>
      cadena(existente),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagService,
        { provide: getModelToken(OrdenTrabajo.name), useValue: Modelo },
      ],
    }).compile();

    servicio = module.get<TagService>(TagService);
    return Modelo as unknown as Record<string, jest.Mock>;
  };

  beforeEach(() => {
    guardado = {};
  });

  describe('create', () => {
    it('exige tag y area', async () => {
      await construir(null);

      await expect(
        servicio.create({ area: 'Chancado' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        servicio.create({ tag: 'OT-1' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un campo obligatorio ausente es 400, no 500', async () => {
      // Antes se lanzaba un `Error` pelado, que el filtro global traduce a 500
      // «Error interno del servidor» — culpando al servidor de un fallo del
      // cliente.
      await construir(null);

      await expect(servicio.create({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un tag que ya existe', async () => {
      await construir({ _id: 'x', tag: 'OT-1' });

      await expect(
        servicio.create({ tag: 'OT-1', area: 'Chancado' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recorta los espacios de tag y area antes de guardar', async () => {
      await construir(null);

      await servicio.create({ tag: '  OT-1  ', area: '  Chancado  ' } as never);

      expect(guardado.tag).toBe('OT-1');
      expect(guardado.area).toBe('Chancado');
    });

    it('nace activo salvo que se diga lo contrario', async () => {
      await construir(null);

      await servicio.create({ tag: 'OT-1', area: 'A' } as never);
      expect(guardado.activo).toBe(true);

      await servicio.create({ tag: 'OT-2', area: 'A', activo: false } as never);
      expect(guardado.activo).toBe(false);
    });
  });

  describe('findByArea', () => {
    it('un area vacia se rechaza', async () => {
      await construir(null);

      await expect(servicio.findByArea('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(servicio.findByArea('   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('solo devuelve los tags activos del area', async () => {
      const Modelo = await construir(null, [{ tag: 'OT-1' }, { tag: 'OT-2' }]);

      await expect(servicio.findByArea('Chancado')).resolves.toEqual([
        'OT-1',
        'OT-2',
      ]);

      const filtro = Modelo.find.mock.calls[0][0] as {
        area: string;
        activo: boolean;
      };
      expect(filtro).toMatchObject({ area: 'Chancado', activo: true });
    });

    it('recorta los espacios del area buscada', async () => {
      const Modelo = await construir(null, []);

      await servicio.findByArea('  Chancado  ');

      const filtro = Modelo.find.mock.calls[0][0] as { area: string };
      expect(filtro.area).toBe('Chancado');
    });
  });
});
