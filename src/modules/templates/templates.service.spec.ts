import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { Template } from './schemas/template.schema';
import { Instance } from '../instances/schemas/instance.schema';
import { FILTRO_VIGENTE } from '../../common/versionado/versionado';

/**
 * Las plantillas son el molde de toda inspección: su `code` es lo que enlaza
 * el formulario del frontend con el generador de Excel y con la configuración
 * de frecuencia. Que un código se duplique o que una plantilla se «pierda» al
 * buscarla tiene efectos en cadena.
 */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'sort', 'select', 'limit', 'lean'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('TemplatesService', () => {
  let servicio: TemplatesService;
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
    (Modelo as unknown as Record<string, jest.Mock>).findOne = jest.fn(() =>
      cadena(resultado),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: getModelToken(Template.name), useValue: Modelo },
        {
          provide: getModelToken(Instance.name),
          useValue: { countDocuments: jest.fn(() => cadena(0)) },
        },
      ],
    }).compile();

    servicio = module.get<TemplatesService>(TemplatesService);
    modelo = Modelo as unknown as Record<string, jest.Mock>;
  };

  describe('create', () => {
    it('un codigo duplicado se traduce a conflicto, no a error crudo', async () => {
      // El indice unico de Mongo lanza E11000; sin esta traduccion el usuario
      // recibiria un 500 en vez de «ya existe».
      await construir(null, () => {
        const error: Error & { code?: number } = new Error('E11000');
        error.code = 11000;
        return Promise.reject(error);
      });

      await expect(
        servicio.create({ code: '1.02.P06.F19' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('otros errores se propagan tal cual', async () => {
      // Tragarse cualquier fallo como «conflicto» ocultaria problemas reales.
      await construir(null, () => Promise.reject(new Error('sin conexion')));

      await expect(servicio.create({} as never)).rejects.toThrow(
        /sin conexion/,
      );
    });
  });

  describe('findAll', () => {
    it('sin filtros consulta solo las revisiones vigentes', async () => {
      // Las obsoletas y los borradores no se ofrecen para inspeccionar.
      await construir([]);

      await servicio.findAll();

      expect(modelo.find).toHaveBeenCalledWith(FILTRO_VIGENTE);
    });

    it('filtra por tipo y por estado activo', async () => {
      await construir([]);

      await servicio.findAll({ type: 'IRO', isActive: true });

      expect(modelo.find).toHaveBeenCalledWith({
        ...FILTRO_VIGENTE,
        type: 'IRO',
        isActive: true,
      });
    });

    it('isActive false se respeta (no se confunde con «sin filtro»)', async () => {
      // Un `if (filters.isActive)` a secas trataria `false` como ausente y
      // devolveria tambien las plantillas activas.
      await construir([]);

      await servicio.findAll({ isActive: false });

      const filtro = modelo.find.mock.calls[0][0] as { isActive?: boolean };
      expect(filtro.isActive).toBe(false);
    });

    it('el texto busca en nombre y en codigo', async () => {
      await construir([]);

      await servicio.findAll({ search: 'arnes' });

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { name?: unknown; code?: unknown }[];
      };
      expect(filtro.$or).toHaveLength(2);
      expect(filtro.$or[0].name).toBeDefined();
      expect(filtro.$or[1].code).toBeDefined();
    });

    it('escapa el texto del buscador', async () => {
      await construir([]);

      await servicio.findAll({ search: '1.02.P06' });

      const filtro = modelo.find.mock.calls[0][0] as {
        $or: { name?: { $regex?: string } }[];
      };
      // Sin escapar, cada «.» seria un comodin y «1x02xP06» tambien casaria.
      expect(filtro.$or[0].name?.$regex).toBe('1\\.02\\.P06');
    });

    it('devuelve las mas recientes primero', async () => {
      await construir([]);

      await servicio.findAll();

      expect(modelo.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('busquedas puntuales', () => {
    it('findOne de un id inexistente da 404', async () => {
      await construir(null);

      await expect(servicio.findOne('no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findByCode de un codigo inexistente da 404', async () => {
      await construir(null);

      await expect(servicio.findByCode('9.99.NADA')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findByCode busca la vigente por el campo code, no por el id', async () => {
      await construir({ code: '1.02.P06.F19' });

      await servicio.findByCode('1.02.P06.F19');

      expect(modelo.findOne).toHaveBeenCalledWith({
        code: '1.02.P06.F19',
        ...FILTRO_VIGENTE,
      });
      expect(modelo.findById).not.toHaveBeenCalled();
    });
  });
});
