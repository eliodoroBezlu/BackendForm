import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TrabajadoresService } from './trabajadores.service';
import { Trabajador } from './schemas/trabajador.schema';
import { User } from '../auth/schemas/user.schema';

/**
 * Este módulo dejó de ser dueño de sus datos: **IAM Core es la fuente de
 * verdad** y BackendForm solo espeja el roster. Lo que más importa fijar aquí
 * es esa frontera —qué operaciones están cerradas a propósito— y el
 * comportamiento del buscador, que es lo que usa medio frontend.
 */

/** Cadena de consulta de Mongoose: cada eslabón devuelve la misma cadena. */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  [
    'find',
    'findOne',
    'findById',
    'select',
    'sort',
    'limit',
    'lean',
    'populate',
  ].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('TrabajadoresService', () => {
  let servicio: TrabajadoresService;
  let modelo: Record<string, jest.Mock>;

  const construir = async (resultado: unknown) => {
    modelo = cadena(resultado);
    modelo.findByIdAndDelete = jest.fn(() => cadena(resultado));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrabajadoresService,
        { provide: getModelToken(Trabajador.name), useValue: modelo },
        { provide: getModelToken(User.name), useValue: cadena(null) },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    servicio = module.get<TrabajadoresService>(TrabajadoresService);
  };

  describe('la frontera con IAM Core', () => {
    it('crear un trabajador desde aqui esta PROHIBIDO', async () => {
      await construir(null);

      await expect(servicio.create({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('editar el perfil desde aqui tambien esta prohibido', async () => {
      await construir(null);

      await expect(servicio.update('id', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el mensaje explica donde SI se hace', async () => {
      // Un «no se puede» a secas manda al usuario a abrir un ticket. El mensaje
      // tiene que decir a que herramienta ir.
      await construir(null);

      await expect(servicio.create({} as never)).rejects.toThrow(/IAM/);
      await expect(servicio.update('id', {})).rejects.toThrow(/IAM/);
    });

    it('ninguna de las dos toca la base de datos', async () => {
      await construir(null);

      await servicio.create({} as never).catch(() => undefined);
      await servicio.update('id', {}).catch(() => undefined);

      expect(modelo.find).not.toHaveBeenCalled();
      expect(modelo.findById).not.toHaveBeenCalled();
    });
  });

  describe('buscarTrabajadores', () => {
    it('una busqueda vacia devuelve los primeros, no la nomina entera', async () => {
      await construir([]);

      await servicio.buscarTrabajadores('');

      expect(modelo.find).toHaveBeenCalledWith();
      expect(modelo.limit).toHaveBeenCalledWith(10);
    });

    it('solo espacios cuenta como busqueda vacia', async () => {
      await construir([]);

      await servicio.buscarTrabajadores('    ');

      expect(modelo.find).toHaveBeenCalledWith();
    });

    it('busca por nomina y por cedula a la vez', async () => {
      await construir([]);

      await servicio.buscarTrabajadores('perez');

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { nomina?: unknown; ci?: unknown }[];
      };
      expect(filtro.$or).toHaveLength(2);
      expect(filtro.$or[0].nomina).toMatchObject({ $options: 'i' });
      expect(filtro.$or[1].ci).toMatchObject({ $options: 'i' });
    });

    it('la busqueda no distingue mayusculas', async () => {
      await construir([]);

      await servicio.buscarTrabajadores('PEREZ');

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { nomina?: { $options?: string } }[];
      };
      expect(filtro.$or[0].nomina?.$options).toBe('i');
    });

    it('siempre acota el resultado a 10', async () => {
      await construir([]);

      await servicio.buscarTrabajadores('a');

      // Sin el limite, buscar una letra suelta traeria la nomina completa.
      expect(modelo.limit).toHaveBeenCalledWith(10);
    });

    it('el texto del usuario se escapa antes de entrar al $regex', async () => {
      // Sin escapar, «.*» devolvia toda la nomina en vez de buscar ese texto.
      await construir([]);

      await servicio.buscarTrabajadores('.*');

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { nomina?: { $regex?: string } }[];
      };
      expect(filtro.$or[0].nomina?.$regex).toBe('\\.\\*');
    });

    it('un parentesis ya no rompe la busqueda', async () => {
      // Comprobado contra Mongo: «(» sin escapar devuelve error Location51091,
      // es decir, un 500 al usuario por escribir un parentesis.
      await construir([]);

      await servicio.buscarTrabajadores('Perez (Juan)');

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { nomina?: { $regex?: string } }[];
      };
      expect(filtro.$or[0].nomina?.$regex).toBe('Perez \\(Juan\\)');
    });
  });

  describe('buscarTrabajadoresNames', () => {
    it('devuelve solo los nombres, no los documentos', async () => {
      await construir([
        { nomina: 'Perez Juan', ci: '123' },
        { nomina: 'Perez Ana', ci: '456' },
      ]);

      await expect(servicio.buscarTrabajadoresNames('perez')).resolves.toEqual([
        'Perez Juan',
        'Perez Ana',
      ]);
    });
  });

  describe('findAllCompletos', () => {
    it('rellena con cadena vacia los campos que faltan', async () => {
      // El frontend pinta estos valores directamente; un `undefined` se veria
      // como «undefined» en pantalla.
      await construir([{ nomina: 'Perez Juan' }]);

      await expect(servicio.findAllCompletos()).resolves.toEqual([
        { nomina: 'Perez Juan', ci: '', puesto: '' },
      ]);
    });

    it('viene ordenado por nomina', async () => {
      await construir([]);

      await servicio.findAllCompletos();

      expect(modelo.sort).toHaveBeenCalledWith({ nomina: 1 });
    });
  });

  describe('busquedas que no encuentran nada', () => {
    it('findOne de un id inexistente da 404, no null', async () => {
      await construir(null);

      await expect(servicio.findOne('id-que-no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findByUsername de un usuario inexistente da 404', async () => {
      await construir(null);

      await expect(servicio.findByUsername('fantasma')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('el error de username dice cual se buscaba', async () => {
      await construir(null);

      await expect(servicio.findByUsername('fantasma')).rejects.toThrow(
        /fantasma/,
      );
    });

    it('borrar un trabajador inexistente da 404', async () => {
      await construir(null);

      await expect(servicio.remove('id-que-no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
