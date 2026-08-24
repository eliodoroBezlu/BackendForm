import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AreaService } from './area.service';
import { Area } from './schemas/area.schema';
import { Superintendencia } from '../superintendencia/schemas/superintendencia.schema';

/**
 * El área cuelga siempre de una superintendencia, y esa relación tiene reglas
 * que aquí quedan fijadas. También el autocompletado, que es lo que usa todo
 * formulario para elegir área.
 */

const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'select', 'sort', 'limit', 'lean', 'populate'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('AreaService', () => {
  let servicio: AreaService;
  let modeloArea: Record<string, jest.Mock>;
  let modeloSuper: Record<string, jest.Mock>;

  const construir = async ({
    areas = [] as unknown,
    areaExistente = null as unknown,
    superintendencia = null as unknown,
  } = {}) => {
    modeloArea = cadena(areas);
    modeloArea.findOne = jest.fn().mockResolvedValue(areaExistente);
    modeloSuper = cadena([]);
    modeloSuper.findById = jest.fn().mockResolvedValue(superintendencia);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreaService,
        { provide: getModelToken(Area.name), useValue: modeloArea },
        {
          provide: getModelToken(Superintendencia.name),
          useValue: modeloSuper,
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    servicio = module.get<AreaService>(AreaService);
  };

  describe('create', () => {
    const dto = { nombre: 'Chancado', superintendencia: 'id-sup' } as never;

    it('exige que la superintendencia exista', async () => {
      await construir({ superintendencia: null });

      await expect(servicio.create(dto, 'admin')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('NO permite colgar un area de una superintendencia inactiva', async () => {
      // Si no, al reactivarla aparecerian areas que nadie recuerda haber creado.
      await construir({
        superintendencia: { _id: 'id-sup', activo: false },
      });

      await expect(servicio.create(dto, 'admin')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un nombre repetido dentro de la misma superintendencia', async () => {
      await construir({
        superintendencia: { _id: 'id-sup', activo: true },
        areaExistente: { _id: 'ya-existe', nombre: 'Chancado' },
      });

      await expect(servicio.create(dto, 'admin')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('la comprobacion de duplicado no distingue mayusculas', async () => {
      await construir({
        superintendencia: { _id: 'id-sup', activo: true },
        areaExistente: null,
      });

      await servicio.create(dto, 'admin').catch(() => undefined);

      const filtro = modeloArea.findOne.mock.calls[0][0] as {
        nombre: { $regex: RegExp };
      };
      expect(filtro.nombre.$regex.flags).toContain('i');
      // Anclado a los extremos: «Chan» no debe contar como duplicado de
      // «Chancado».
      expect(filtro.nombre.$regex.source.startsWith('^')).toBe(true);
      expect(filtro.nombre.$regex.source.endsWith('$')).toBe(true);
    });

    it('un nombre con parentesis no rompe la comprobacion', async () => {
      await construir({
        superintendencia: { _id: 'id-sup', activo: true },
        areaExistente: null,
      });

      await servicio
        .create(
          { nombre: 'Planta (Sur)', superintendencia: 'id-sup' } as never,
          'admin',
        )
        .catch(() => undefined);

      const filtro = modeloArea.findOne.mock.calls[0][0] as {
        nombre: { $regex: RegExp };
      };
      // Sin escapar, `new RegExp('^Planta (Sur)$')` trataria el parentesis
      // como grupo de captura y la comparacion dejaria de ser exacta.
      expect(filtro.nombre.$regex.source).toContain('\\(');
    });
  });

  describe('buscarArea', () => {
    it('sin texto devuelve las areas activas', async () => {
      await construir({ areas: [{ nombre: 'Chancado' }] });

      await expect(servicio.buscarArea('')).resolves.toEqual(['Chancado']);
      expect(modeloArea.find).toHaveBeenCalledWith({ activo: true });
    });

    it('un texto que no es cadena se trata como busqueda vacia', async () => {
      await construir({ areas: [] });

      await servicio.buscarArea(undefined as never);

      expect(modeloArea.find).toHaveBeenCalledWith({ activo: true });
    });

    it('solo devuelve areas activas', async () => {
      await construir({ areas: [] });

      await servicio.buscarArea('chan');

      const filtro = modeloArea.find.mock.calls[0][0] as { activo?: boolean };
      expect(filtro.activo).toBe(true);
    });

    it('acota el resultado a 20', async () => {
      await construir({ areas: [] });

      await servicio.buscarArea('a');

      expect(modeloArea.limit).toHaveBeenCalledWith(20);
    });

    it('escapa el texto antes de meterlo en el $regex', async () => {
      await construir({ areas: [] });

      await servicio.buscarArea('Planta (Sur)');

      const filtro = modeloArea.find.mock.calls[0][0] as {
        nombre: { $regex: string };
      };
      expect(filtro.nombre.$regex).toBe('Planta \\(Sur\\)');
    });

    it('devuelve solo los nombres, no los documentos', async () => {
      await construir({
        areas: [{ nombre: 'Chancado', _id: 'x' }, { nombre: 'Molienda' }],
      });

      await expect(servicio.buscarArea('a')).resolves.toEqual([
        'Chancado',
        'Molienda',
      ]);
    });
  });
});
