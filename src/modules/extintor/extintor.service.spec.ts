import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ExtintorService } from './extintor.service';
import { Extintor } from './schemas/extintor.schema';

/**
 * Lo que más importa fijar aquí es **el código de estado de cada fallo**.
 *
 * Todos los métodos envuelven su cuerpo en `try/catch`, y ese catch relanzaba
 * un `Error` pelado — incluidas las excepciones de Nest lanzadas dentro. Un
 * «extintor no encontrado» llegaba al usuario como **500 Error interno del
 * servidor** en vez de 404, lo que hace imposible distinguir un dato que falta
 * de una caída real.
 */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'select', 'sort', 'limit', 'lean'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

const ID_VALIDO = '507f1f77bcf86cd799439011';

describe('ExtintorService', () => {
  let servicio: ExtintorService;
  let modelo: Record<string, jest.Mock>;

  const construir = async (resultado: unknown, alGuardar?: () => unknown) => {
    const consulta = cadena(resultado);

    const Modelo = function (this: unknown, datos: never) {
      Object.assign(this as object, datos);
      (this as { save: () => unknown }).save = () =>
        alGuardar ? alGuardar() : Promise.resolve(datos);
    } as unknown as new (d: unknown) => unknown;

    Object.assign(Modelo, consulta);
    (Modelo as unknown as Record<string, jest.Mock>).findById = jest.fn(() =>
      cadena(resultado),
    );
    (Modelo as unknown as Record<string, jest.Mock>).countDocuments = jest.fn(
      () => cadena(0),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtintorService,
        { provide: getModelToken(Extintor.name), useValue: Modelo },
      ],
    }).compile();

    servicio = module.get<ExtintorService>(ExtintorService);
    modelo = Modelo as unknown as Record<string, jest.Mock>;
  };

  describe('el codigo de estado de cada fallo', () => {
    it('un extintor inexistente da 404, no 500', async () => {
      await construir(null);

      await expect(servicio.findOne(ID_VALIDO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('un id mal formado da 400, no 500', async () => {
      await construir(null);

      await expect(
        servicio.findOne('no-es-un-objectid'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un codigo duplicado da 409, no 500', async () => {
      await construir(null, () => {
        const error: Error & { code?: number } = new Error('E11000');
        error.code = 11000;
        return Promise.reject(error);
      });

      await expect(
        servicio.create({ CodigoExtintor: 'EXT-01' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('buscar por codigo vacio da 400', async () => {
      await construir([]);

      await expect(servicio.findByCodigo('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('findByTag', () => {
    it('solo trae extintores activos y aun sin inspeccionar', async () => {
      await construir([]);

      await servicio.findByTag('TAG-01');

      const filtro = modelo.find.mock.calls[0][0] as {
        activo: boolean;
        inspeccionado: boolean;
      };
      // Si se colara un inspeccionado, aparecería otra vez en la lista de
      // pendientes del mes.
      expect(filtro.activo).toBe(true);
      expect(filtro.inspeccionado).toBe(false);
    });

    it('el tag se compara entero y sin distinguir mayusculas', async () => {
      await construir([]);

      await servicio.findByTag('tag-01');

      const filtro = modelo.find.mock.calls[0][0] as { tag: RegExp };
      expect(filtro.tag.flags).toContain('i');
      expect(filtro.tag.source.startsWith('^')).toBe(true);
      expect(filtro.tag.source.endsWith('$')).toBe(true);
    });

    it('un tag con parentesis no rompe la consulta', async () => {
      await construir([]);

      await servicio.findByTag('OT (2026)');

      const filtro = modelo.find.mock.calls[0][0] as { tag: RegExp };
      expect(filtro.tag.source).toContain('\\(');
    });
  });
});
