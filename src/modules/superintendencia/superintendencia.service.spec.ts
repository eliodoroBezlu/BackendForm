import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { SuperintendenciaService } from './superintendencia.service';
import { Superintendencia } from './schemas/superintendencia.schema';

/** Catálogo pequeño, pero del que cuelgan todas las áreas. */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'select', 'sort', 'limit', 'lean', 'populate'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('SuperintendenciaService', () => {
  let servicio: SuperintendenciaService;
  let modelo: Record<string, jest.Mock>;

  const construir = async (resultado: unknown, existente: unknown = null) => {
    modelo = cadena(resultado);
    modelo.findOne = jest.fn().mockResolvedValue(existente);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperintendenciaService,
        { provide: getModelToken(Superintendencia.name), useValue: modelo },
      ],
    }).compile();

    servicio = module.get<SuperintendenciaService>(SuperintendenciaService);
  };

  describe('create', () => {
    it('rechaza un nombre que ya existe', async () => {
      await construir([], { _id: 'x', nombre: 'Mina' });

      await expect(
        servicio.create({ nombre: 'Mina' } as never, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('la comprobacion es exacta y sin distinguir mayusculas', async () => {
      await construir([], null);

      await servicio
        .create({ nombre: 'Mina' } as never, 'admin')
        .catch(() => undefined);

      const filtro = modelo.findOne.mock.calls[0][0] as {
        nombre: { $regex: RegExp };
      };
      expect(filtro.nombre.$regex.flags).toContain('i');
      // Anclada: «Min» no puede contar como duplicado de «Mina».
      expect(filtro.nombre.$regex.source.startsWith('^')).toBe(true);
      expect(filtro.nombre.$regex.source.endsWith('$')).toBe(true);
    });

    it('un nombre con parentesis no rompe la comprobacion', async () => {
      await construir([], null);

      await servicio
        .create({ nombre: 'Mina (Rajo)' } as never, 'admin')
        .catch(() => undefined);

      const filtro = modelo.findOne.mock.calls[0][0] as {
        nombre: { $regex: RegExp };
      };
      expect(filtro.nombre.$regex.source).toContain('\\(');
    });
  });

  describe('buscarSuperintendencia', () => {
    it('sin texto devuelve las activas, acotadas', async () => {
      await construir([{ nombre: 'Mina' }]);

      await expect(servicio.buscarSuperintendencia('')).resolves.toEqual([
        'Mina',
      ]);
      expect(modelo.find).toHaveBeenCalledWith({ activo: true });
      expect(modelo.limit).toHaveBeenCalledWith(20);
    });

    it('solo devuelve las activas tambien al buscar', async () => {
      await construir([]);

      await servicio.buscarSuperintendencia('mi');

      const filtro = modelo.find.mock.calls[0][0] as { activo?: boolean };
      expect(filtro.activo).toBe(true);
    });

    it('escapa el texto del usuario', async () => {
      await construir([]);

      await servicio.buscarSuperintendencia('Mina (Rajo)');

      const filtro = modelo.find.mock.calls[0][0] as {
        nombre: { $regex: string };
      };
      expect(filtro.nombre.$regex).toBe('Mina \\(Rajo\\)');
    });

    it('devuelve nombres, no documentos', async () => {
      await construir([{ nombre: 'Mina' }, { nombre: 'Planta' }]);

      await expect(servicio.buscarSuperintendencia('a')).resolves.toEqual([
        'Mina',
        'Planta',
      ]);
    });
  });
});
