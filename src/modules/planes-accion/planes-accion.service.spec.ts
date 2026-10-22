import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanesAccionService } from './planes-accion.service';
import { PlanDeAccion } from './schemas/plan-accion.schema';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';
import { Area } from '../area/schemas/area.schema';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';
import { Instance } from '../instances/schemas/instance.schema';

/** El maestro de áreas y las fichas: solo los usa el alcance por área. */
const modelosDelAlcance = [
  { provide: getModelToken(Area.name), useValue: {} },
  { provide: getModelToken(Trabajador.name), useValue: {} },
  { provide: getModelToken(Instance.name), useValue: {} },
];

/**
 * Las reglas de cálculo viven en `domain/` y tienen sus propias pruebas. Lo
 * que queda aquí es la **orquestación**: validar el identificador, cargar el
 * documento, aplicar la baja lógica y volver a numerar.
 *
 * La baja lógica es lo delicado: las tareas nunca se borran, se marcan. Si el
 * filtrado falla, reaparecen tareas que el usuario dio por cerradas.
 */
const ID_VALIDO = '507f1f77bcf86cd799439011';

const tarea = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: { toString: () => id },
  numeroItem: 1,
  estado: 'abierto',
  activo: true,
  ...extra,
});

const plan = (tareas: unknown[]) => {
  const doc = {
    _id: ID_VALIDO,
    tareas,
    fechaUltimaActualizacion: new Date(2020, 0, 1),
    save: jest.fn(),
    // Mongoose necesita que se le avise de los cambios dentro de un array.
    markModified: jest.fn(),
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('PlanesAccionService · orquestación', () => {
  let servicio: PlanesAccionService;

  const construir = async (doc: unknown) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesAccionService,
        {
          provide: getModelToken(PlanDeAccion.name),
          useValue: { findById: jest.fn().mockResolvedValue(doc) },
        },
        { provide: InstancesService, useValue: { findOne: jest.fn() } },
        { provide: TemplatesService, useValue: { findOne: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        ...modelosDelAlcance,
      ],
    }).compile();

    servicio = module.get<PlanesAccionService>(PlanesAccionService);
  };

  describe('validacion del identificador', () => {
    it('un id mal formado da 400, no 500', async () => {
      // Sin esta comprobacion, Mongoose lanza un CastError que salia como 500.
      await construir(null);

      await expect(
        servicio.addTarea('no-es-un-id', {} as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        servicio.deleteTarea('no-es-un-id', 'x'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un plan inexistente da 404', async () => {
      await construir(null);

      await expect(
        servicio.deleteTarea(ID_VALIDO, 'tarea-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteTarea — baja logica', () => {
    it('no borra: marca la tarea como inactiva', async () => {
      const t = tarea('tarea-1');
      await construir(plan([t]));

      await servicio.deleteTarea(ID_VALIDO, 'tarea-1');

      expect(t.activo).toBe(false);
    });

    it('SE GUARDA ANTES de filtrar la respuesta', async () => {
      // El orden importa mucho: `save()` persiste el array completo con la
      // tarea marcada, y solo despues se filtra el documento en memoria para
      // devolverlo. Si alguien invirtiera el orden —o anadiera otro `save()`
      // detras— las tareas dadas de baja se borrarian FISICAMENTE de Mongo.
      const doc = plan([tarea('t1'), tarea('t2')]);
      let tareasAlGuardar = -1;
      doc.save = jest.fn(() => {
        tareasAlGuardar = doc.tareas.length;
        return Promise.resolve(doc);
      });
      await construir(doc);

      await servicio.deleteTarea(ID_VALIDO, 't2');

      expect(tareasAlGuardar).toBe(2); // las dos, incluida la dada de baja
      expect(doc.tareas).toHaveLength(1); // la respuesta ya viene filtrada
    });

    it('una tarea ya dada de baja se comporta como inexistente', async () => {
      await construir(plan([tarea('tarea-1', { activo: false })]));

      await expect(
        servicio.deleteTarea(ID_VALIDO, 'tarea-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('una tarea que no esta en el plan da 404', async () => {
      await construir(plan([tarea('tarea-1')]));

      await expect(
        servicio.deleteTarea(ID_VALIDO, 'tarea-inventada'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renumera las tareas ACTIVAS de forma correlativa', async () => {
      // Si no se renumeran, quedan huecos: 1, 3, 4 — y el acta impresa los
      // muestra tal cual.
      const t1 = tarea('t1', { numeroItem: 1 });
      const t2 = tarea('t2', { numeroItem: 2 });
      const t3 = tarea('t3', { numeroItem: 3 });
      await construir(plan([t1, t2, t3]));

      await servicio.deleteTarea(ID_VALIDO, 't2');

      expect(t1.numeroItem).toBe(1);
      expect(t3.numeroItem).toBe(2);
    });

    it('la tarea dada de baja no sale en la respuesta', async () => {
      const doc = plan([tarea('t1'), tarea('t2')]);
      await construir(doc);

      const resultado = await servicio.deleteTarea(ID_VALIDO, 't2');

      expect(resultado.tareas).toHaveLength(1);
    });

    it('deja constancia de cuando se toco el plan', async () => {
      const doc = plan([tarea('t1')]);
      await construir(doc);

      await servicio.deleteTarea(ID_VALIDO, 't1');

      expect(doc.fechaUltimaActualizacion.getFullYear()).toBeGreaterThan(2020);
    });
  });
});

describe('PlanesAccionService · generar desde una inspeccion', () => {
  /**
   * El modelo simulado: `findOne` contesta si la inspección ya tiene plan, y
   * construir + `save` deja en `guardados` lo que se habría escrito.
   */
  const construirCon = async (
    instancia: unknown,
    plantilla: unknown,
    planExistente: unknown = null,
  ) => {
    const guardados: Record<string, unknown>[] = [];
    const Modelo = function (this: unknown, datos: Record<string, unknown>) {
      Object.assign(this as object, datos);
      (this as { save: () => unknown }).save = () => {
        guardados.push(datos);
        return Promise.resolve(datos);
      };
    } as unknown as { findOne: jest.Mock };
    Modelo.findOne = jest.fn(() => ({
      exec: () => Promise.resolve(planExistente),
    }));

    const alTerminar = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesAccionService,
        { provide: getModelToken(PlanDeAccion.name), useValue: Modelo },
        {
          provide: InstancesService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(instancia),
            alTerminar,
          },
        },
        {
          provide: TemplatesService,
          useValue: { findOne: jest.fn().mockResolvedValue(plantilla) },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        ...modelosDelAlcance,
      ],
    }).compile();
    const servicio = module.get<PlanesAccionService>(PlanesAccionService);
    return { servicio, guardados, alTerminar, module };
  };

  const plantilla = {
    name: 'IRO Izaje',
    sections: [{ _id: 's1', title: 'Izaje de cargas' }],
  };
  const inspeccion = (
    ...preguntas: { response: number | string; comment?: string }[]
  ) => ({
    templateId: ID_VALIDO,
    verificationList: { Área: 'Flotación' },
    sections: [
      {
        sectionId: 's1',
        questions: preguntas.map((p) => ({ questionText: 'P', ...p })),
      },
    ],
  });

  it('si las secciones ya no estan en la plantilla lo dice, en vez de «no hay observaciones»', async () => {
    // La plantilla se edito en el lugar y sus secciones cambiaron de _id: el
    // hallazgo existe, pero no se puede ubicar.
    const { servicio } = await construirCon(
      {
        templateId: ID_VALIDO,
        sections: [
          {
            sectionId: 'id-viejo',
            questions: [{ questionText: 'P', response: 1, comment: 'Falla' }],
          },
        ],
      },
      { name: 'IRO', sections: [{ _id: 'id-nuevo', title: 'Izaje' }] },
    );

    await expect(servicio.generarPlanDesdeInstancia(ID_VALIDO)).rejects.toThrow(
      '1 de 1 secciones de esta inspección ya no existen',
    );
  });

  it('a mano no se crea un segundo plan para la misma inspeccion', async () => {
    const { servicio } = await construirCon(
      inspeccion({ response: 1, comment: 'Falla' }),
      plantilla,
      { _id: 'plan-1' },
    );

    await expect(
      servicio.generarPlanDesdeInstancia(ID_VALIDO),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('al terminar la IRO', () => {
    it('se registra para enterarse de cada IRO que se termina', async () => {
      const { alTerminar, module } = await construirCon(
        inspeccion(),
        plantilla,
      );

      module.get(PlanesAccionService).onModuleInit();

      expect(alTerminar).toHaveBeenCalledTimes(1);
    });

    it('con observaciones crea el plan con sus tareas', async () => {
      const { servicio, guardados } = await construirCon(
        inspeccion({ response: 1, comment: 'Falta baranda' }, { response: 3 }),
        plantilla,
      );

      await servicio.generarAlTerminar(ID_VALIDO);

      expect(guardados).toHaveLength(1);
      expect(guardados[0].tareas).toHaveLength(1);
      expect(guardados[0].sinObservaciones).toBeUndefined();
      expect(guardados[0].estado).toBe('abierto');
    });

    it('sin observaciones crea un plan cerrado que dice por que', async () => {
      const { servicio, guardados } = await construirCon(
        inspeccion({ response: 0 }, { response: 3 }),
        plantilla,
      );

      await servicio.generarAlTerminar(ID_VALIDO);

      expect(guardados[0]).toMatchObject({
        tareas: [],
        estado: 'cerrado',
        sinObservaciones: true,
        motivoSinObservaciones:
          '1 pregunta tiene puntaje menor a 3, pero ninguna con comentario: sin comentario no se genera tarea.',
      });
    });

    it('si ya tiene plan no crea otro', async () => {
      const { servicio, guardados } = await construirCon(
        inspeccion({ response: 1, comment: 'Falla' }),
        plantilla,
        { _id: 'plan-1' },
      );

      await servicio.generarAlTerminar(ID_VALIDO);

      expect(guardados).toHaveLength(0);
    });

    it('si no puede leer las secciones no inventa un «sin observaciones»', async () => {
      const { servicio, guardados } = await construirCon(
        {
          ...inspeccion({ response: 1, comment: 'Falla' }),
          sections: [
            {
              sectionId: 'id-viejo',
              questions: [{ questionText: 'P', response: 1, comment: 'Falla' }],
            },
          ],
        },
        plantilla,
      );

      await expect(servicio.generarAlTerminar(ID_VALIDO)).resolves.toBeNull();
      expect(guardados).toHaveLength(0);
    });
  });
});

describe('PlanesAccionService · tipo de inspeccion al listar', () => {
  it('cada plan trae la IRO o ISOP de su inspeccion; uno manual, ninguno', async () => {
    const plan = (id: string, instanceId?: string) => ({
      _id: id,
      instanceId,
      areaFisica: 'Filtros',
      tareas: [],
      toObject() {
        return { _id: id, instanceId, areaFisica: 'Filtros', tareas: [] };
      },
    });
    const cadena = (valor: unknown) => {
      const c: Record<string, jest.Mock> = {};
      for (const m of ['sort', 'select', 'populate', 'lean']) {
        c[m] = jest.fn(() => c);
      }
      c.exec = jest.fn().mockResolvedValue(valor);
      return c;
    };
    const idInspeccion = '507f1f77bcf86cd799439012';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesAccionService,
        {
          provide: getModelToken(PlanDeAccion.name),
          useValue: {
            find: jest.fn(() => cadena([plan('p1', idInspeccion), plan('p2')])),
          },
        },
        { provide: InstancesService, useValue: {} },
        { provide: TemplatesService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        ...modelosDelAlcance.filter(
          (m) => m.provide !== getModelToken(Instance.name),
        ),
        {
          provide: getModelToken(Instance.name),
          useValue: {
            find: jest.fn(() =>
              cadena([
                {
                  _id: idInspeccion,
                  templateId: {
                    code: '1.02.P06.F50',
                    name: 'INSPECCIÓN REGLAS DE ORO, (IRO) - IZAJE',
                  },
                },
              ]),
            ),
          },
        },
      ],
    }).compile();

    const planes = (await module
      .get(PlanesAccionService)
      .findAll({}, ['admin'], 'admin')) as unknown as {
      _id: string;
      tipoInspeccion?: { codigo: string };
    }[];

    expect(planes.find((p) => p._id === 'p1')?.tipoInspeccion?.codigo).toBe(
      '1.02.P06.F50',
    );
    expect(planes.find((p) => p._id === 'p2')?.tipoInspeccion).toBeUndefined();
  });
});
