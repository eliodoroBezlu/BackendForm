import { Test, TestingModule } from '@nestjs/testing';
import { TemplateHerraEquiposController } from './template-herra-equipos.controller';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { Role } from '../auth/enums/role.enum';

/**
 * Este controlador **propaga los roles del usuario** a casi todas las
 * consultas: son los que deciden qué plantillas ve. Olvidar pasarlos en un
 * método no da error — simplemente ese endpoint devuelve el catálogo completo
 * a quien no debía verlo.
 */
describe('TemplateHerraEquiposController · propagación de roles', () => {
  let controller: TemplateHerraEquiposController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      search: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findByCode: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateHerraEquiposController],
      providers: [{ provide: TemplateHerraEquiposService, useValue: servicio }],
    }).compile();

    controller = module.get<TemplateHerraEquiposController>(
      TemplateHerraEquiposController,
    );
  });

  const ROLES = [Role.INSPECTOR_ASIGNADO];

  it('findAll propaga los roles', () => {
    controller.findAll(ROLES, 'arnes');

    expect(servicio.findAll).toHaveBeenCalledWith(
      { type: 'arnes', incluirBorradores: false },
      ROLES,
    );
  });

  it('search propaga los roles', () => {
    controller.search('arnes', ROLES);

    expect(servicio.search).toHaveBeenCalledWith('arnes', ROLES);
  });

  it('count propaga los roles', () => {
    controller.count(ROLES, 'arnes');

    expect(servicio.count).toHaveBeenCalledWith({ type: 'arnes' }, ROLES);
  });

  it('findOne propaga los roles', () => {
    controller.findOne('id-1', ROLES);

    expect(servicio.findOne).toHaveBeenCalledWith('id-1', ROLES);
  });

  it('findByCode propaga los roles', () => {
    controller.findByCode('1.02.P06.F19', ROLES);

    expect(servicio.findByCode).toHaveBeenCalledWith('1.02.P06.F19', ROLES);
  });

  it('sin roles se pasa undefined, no una lista vacia', () => {
    // El servicio distingue los dos casos: `undefined` significa «llamada
    // interna, sin filtro»; una lista vacia tambien, pero conviene que el
    // controlador no invente valores.
    controller.findAll();

    expect(servicio.findAll).toHaveBeenCalledWith(
      { type: undefined, incluirBorradores: false },
      undefined,
    );
  });
});
