import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { TemplateHerraEquipos } from './schemas/template-herra-equipo.schema';
import { Role } from '../auth/enums/role.enum';

/**
 * `filtroPorRoles` decide **qué formularios ve cada rol**. Es una barrera de
 * visibilidad, no un adorno de la interfaz: se aplica en el listado, en la
 * consulta puntual y en los reportes, y las tres tienen que coincidir.
 *
 * Es una función pura, así que se prueba sin tocar la base.
 */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'select', 'sort', 'limit', 'lean'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('TemplateHerraEquiposService · visibilidad por rol', () => {
  let servicio: TemplateHerraEquiposService;
  let modelo: Record<string, jest.Mock>;

  const construir = async (resultado: unknown = []) => {
    modelo = cadena(resultado);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateHerraEquiposService,
        {
          provide: getModelToken(TemplateHerraEquipos.name),
          useValue: modelo,
        },
      ],
    }).compile();

    servicio = module.get<TemplateHerraEquiposService>(
      TemplateHerraEquiposService,
    );
  };

  beforeEach(() => construir());

  describe('filtroPorRoles', () => {
    it('sin roles no filtra nada', () => {
      // Es el caso de las llamadas internas del backend, que no representan a
      // un usuario.
      expect(servicio.filtroPorRoles()).toEqual({});
      expect(servicio.filtroPorRoles([])).toEqual({});
    });

    it.each([
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.SUPERINTENDENTE,
      Role.SUPERVISOR,
    ])('%s ve el catalogo completo', (rol) => {
      expect(servicio.filtroPorRoles([rol])).toEqual({});
    });

    it('un rol acotado SI recibe filtro', () => {
      const filtro = servicio.filtroPorRoles([Role.INSPECTOR_ASIGNADO]);

      expect(filtro).not.toEqual({});
      expect(filtro.$or).toBeDefined();
    });

    it('el rol acotado ve las plantillas sin restriccion declarada', () => {
      // Una plantilla que no declara `rolesVisibles` es publica para todos:
      // si no, añadir el campo a una sola plantilla escondería el resto.
      const filtro = servicio.filtroPorRoles([Role.INSPECTOR_ASIGNADO]) as {
        $or: Record<string, unknown>[];
      };

      const condiciones = JSON.stringify(filtro.$or);
      expect(condiciones).toContain('$exists');
      expect(condiciones).toContain('$size');
    });

    it('y las que lo declaran a el', () => {
      const filtro = servicio.filtroPorRoles([Role.INSPECTOR_ASIGNADO]) as {
        $or: { rolesVisibles?: { $in?: string[] } }[];
      };

      const porRol = filtro.$or.find((c) => c.rolesVisibles?.$in);
      expect(porRol?.rolesVisibles?.$in).toEqual([Role.INSPECTOR_ASIGNADO]);
    });

    it('basta UN rol con vision total para levantar el filtro', () => {
      // Un usuario puede acumular roles; el mas permisivo manda.
      expect(
        servicio.filtroPorRoles([Role.INSPECTOR_ASIGNADO, Role.ADMIN]),
      ).toEqual({});
    });

    it('un rol desconocido no abre el catalogo', () => {
      const filtro = servicio.filtroPorRoles(['rol_inventado']);

      expect(filtro).not.toEqual({});
    });
  });

  describe('la misma regla se aplica en las consultas', () => {
    it('findAll incluye el filtro de visibilidad', async () => {
      await servicio.findAll(undefined, [Role.INSPECTOR_ASIGNADO]);

      const query = modelo.find.mock.calls[0][0] as Record<string, unknown>;
      expect(query.$or).toBeDefined();
    });

    it('findAll combina el filtro de tipo con el de visibilidad', async () => {
      await servicio.findAll({ type: 'arnes' }, [Role.INSPECTOR_ASIGNADO]);

      const query = modelo.find.mock.calls[0][0] as Record<string, unknown>;
      expect(query.type).toBe('arnes');
      expect(query.$or).toBeDefined();
    });

    it('codigosVisibles devuelve solo los codigos', async () => {
      await construir([{ code: '1.02.P06.F19' }, { code: '3.04.P37.F24' }]);

      await expect(
        servicio.codigosVisibles([Role.INSPECTOR_ASIGNADO]),
      ).resolves.toEqual(['1.02.P06.F19', '3.04.P37.F24']);
    });
  });
});
