import { Test, TestingModule } from '@nestjs/testing';
import { PlanesAccionController } from './planes-accion.controller';
import { PlanesAccionService } from './planes-accion.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import { Role } from '../auth/enums/role.enum';

/**
 * Dos cosas se fijan aquí:
 *
 * 1. **Los valores por defecto de la generación de planes.** Vienen de la URL
 *    como cadenas y deciden qué observaciones acaban generando tarea. Un
 *    defecto invertido cambia el contenido del plan sin que nadie lo note.
 * 2. **Que los roles del usuario lleguen a la consulta**: son los que impiden
 *    que un supervisor vea planes aún sin aprobar.
 */
describe('PlanesAccionController', () => {
  let controller: PlanesAccionController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      generarPlanDesdeInstancia: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      getStats: jest.fn().mockResolvedValue({}),
      aprobarGlobal: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      addTarea: jest.fn().mockResolvedValue({}),
      updateTarea: jest.fn().mockResolvedValue({}),
      deleteTarea: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanesAccionController],
      providers: [
        { provide: PlanesAccionService, useValue: servicio },
        {
          provide: PlanesAccionExcelService,
          useValue: { generar: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PlanesAccionController>(PlanesAccionController);
  });

  const opcionesUsadas = () =>
    servicio.generarPlanDesdeInstancia.mock.calls[0][1] as Record<
      string,
      boolean
    >;

  describe('opciones de generación', () => {
    it('sin parametros: solo puntajes bajos CON comentario', async () => {
      // Es el criterio conservador: no generar tareas de observaciones que
      // nadie explico.
      await controller.generarPlanDesdeInstancia('inst-1');

      expect(opcionesUsadas()).toEqual({
        incluirPuntaje3: false,
        incluirSoloConComentario: true,
      });
    });

    it('«incluirPuntaje3=true» amplia el criterio', async () => {
      await controller.generarPlanDesdeInstancia('inst-1', 'true');

      expect(opcionesUsadas().incluirPuntaje3).toBe(true);
    });

    it('cualquier otro valor NO lo activa', async () => {
      // Solo la cadena «true» cuenta; «1» o «si» no deben colar.
      await controller.generarPlanDesdeInstancia('inst-1', '1');

      expect(opcionesUsadas().incluirPuntaje3).toBe(false);
    });

    it('«incluirSoloConComentario» es true salvo que se pida «false»', async () => {
      // Ojo con la asimetria: este defecto es el contrario del anterior.
      await controller.generarPlanDesdeInstancia('inst-1', undefined, 'false');
      expect(opcionesUsadas().incluirSoloConComentario).toBe(false);

      servicio.generarPlanDesdeInstancia.mockClear();
      await controller.generarPlanDesdeInstancia('inst-1', undefined, 'algo');
      expect(opcionesUsadas().incluirSoloConComentario).toBe(true);
    });
  });

  describe('propagación de roles', () => {
    it('findOne pasa los roles del usuario', () => {
      controller.findOne('plan-1', [Role.SUPERVISOR]);

      expect(servicio.findOne).toHaveBeenCalledWith('plan-1', [
        Role.SUPERVISOR,
      ]);
    });

    it('findAll pasa los roles ademas de los filtros', () => {
      controller.findAll('abierto', undefined, undefined, undefined, [
        Role.SUPERVISOR,
      ]);

      const [, roles] = servicio.findAll.mock.calls[0] as [
        unknown,
        string[] | undefined,
      ];
      expect(roles).toEqual([Role.SUPERVISOR]);
    });
  });
});
