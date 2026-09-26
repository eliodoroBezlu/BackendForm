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
    modeloArea.findByIdAndUpdate = jest.fn(() => ({
      exec: jest.fn().mockResolvedValue(areaExistente),
    }));
    modeloArea.findOneAndUpdate = jest.fn(() => ({
      exec: jest.fn().mockResolvedValue(areaExistente),
    }));
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

  /**
   * Un área nunca se borra: hay inspecciones, equipos y trabajadores que
   * apuntan a ella, y borrarla los dejaría señalando a un identificador que ya
   * no existe.
   */
  describe('remove', () => {
    it('marca inactiva en vez de borrar, dejando quién y cuándo', async () => {
      await construir({ areaExistente: { nombre: 'Chancado' } });

      await servicio.remove('id-1', 'jperez');

      expect(modeloArea.findByIdAndDelete).toBeUndefined();
      const [id, cambios] = modeloArea.findByIdAndUpdate.mock.calls[0] as [
        string,
        { activo: boolean; eliminadaPor: string; eliminadaEn: Date },
      ];
      expect(id).toBe('id-1');
      expect(cambios.activo).toBe(false);
      expect(cambios.eliminadaPor).toBe('jperez');
      expect(cambios.eliminadaEn).toBeInstanceOf(Date);
    });

    it('devuelve el documento, que es lo que archiva la auditoría', async () => {
      await construir({ areaExistente: { nombre: 'Chancado' } });

      const salida = await servicio.remove('id-1', 'jperez');

      expect(salida.data).toEqual({ nombre: 'Chancado' });
    });

    it('da 404 si no existe o ya estaba de baja', async () => {
      await construir({ areaExistente: null });

      await expect(servicio.remove('id-1', 'jperez')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restaurar', () => {
    it('solo actúa sobre un área que estaba dada de baja', async () => {
      await construir({ areaExistente: { nombre: 'Chancado' } });

      await servicio.restaurar('id-1');

      const [filtro] = modeloArea.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(filtro).toEqual({ _id: 'id-1', activo: false });
    });
  });

  /**
   * La cadena que los formularios usan para deducir superintendencia y
   * gerencia del área elegida, en vez de pedírselas al inspector.
   */
  describe('obtenerCadenaOrganizativa', () => {
    it('aplana los dos escalones que hay por encima del área', async () => {
      await construir({
        areas: [
          {
            nombre: 'Flotacion',
            superintendencia: {
              nombre: 'SUPERINTENDENCIA DE OPERACIONES PLANTA',
              gerencia_id: { nombre: 'GERENCIA DE OPERACIONES PLANTA' },
            },
          },
        ],
      });

      await expect(servicio.obtenerCadenaOrganizativa()).resolves.toEqual([
        {
          area: 'Flotacion',
          superintendencia: 'SUPERINTENDENCIA DE OPERACIONES PLANTA',
          gerencia: 'GERENCIA DE OPERACIONES PLANTA',
        },
      ]);
    });

    it('devuelve la gerencia vacía cuando la superintendencia no tiene', async () => {
      // No es un fallo: `gerencia_id` es opcional porque el catálogo del IAM
      // no expone gerencias y se asignan a mano. Quien consuma esto tiene que
      // contar con el hueco.
      await construir({
        areas: [{ nombre: 'Chancado', superintendencia: { nombre: 'SUP X' } }],
      });

      await expect(servicio.obtenerCadenaOrganizativa()).resolves.toEqual([
        { area: 'Chancado', superintendencia: 'SUP X', gerencia: null },
      ]);
    });

    it('no se cae si un área quedó sin superintendencia poblada', async () => {
      await construir({ areas: [{ nombre: 'Huérfana' }] });

      await expect(servicio.obtenerCadenaOrganizativa()).resolves.toEqual([
        { area: 'Huérfana', superintendencia: null, gerencia: null },
      ]);
    });

    it('deja fuera las áreas dadas de baja', async () => {
      await construir({ areas: [] });

      await servicio.obtenerCadenaOrganizativa();

      expect(modeloArea.find).toHaveBeenCalledWith({
        activo: { $ne: false },
      });
    });
  });
});
