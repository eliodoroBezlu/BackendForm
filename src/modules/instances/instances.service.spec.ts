import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { TemplatesService } from '../templates/templates.service';
import { Instance } from './schemas/instance.schema';
import type { CreateInstanceDto } from './dto/create-instance.dto';

/**
 * Lo que se prueba aquí es **el cálculo del puntaje**, que es de donde salen
 * los porcentajes de cumplimiento de todo el sistema: los informes, el panel y
 * la decisión de qué observaciones generan plan de acción.
 *
 * El modelo de Mongoose se simula con un constructor que devuelve lo que se le
 * pasa, así que las aserciones caen sobre los números calculados y no sobre
 * cómo se guardan.
 */

/** Sección del template: aporta el `maxPoints` de referencia. */
const seccionPlantilla = (id: string, maxPoints: number, numPreguntas = 2) => ({
  _id: { toString: () => id },
  maxPoints,
  // El valor de cada pregunta sale de dividir maxPoints entre estas.
  questions: Array.from({ length: numPreguntas }, (_, i) => ({
    text: `pregunta ${i}`,
    obligatorio: false,
  })),
  subsections: [],
});

/** Respuesta del inspector a una sección. */
const respuestas = (id: string, valores: (number | string)[]) => ({
  sectionId: id,
  questions: valores.map((response, i) => ({
    questionId: `q${i}`,
    response,
  })),
});

describe('InstancesService · cálculo de puntaje', () => {
  let servicio: InstancesService;
  let guardado: Record<string, unknown>;

  const construir = async (seccionesPlantilla: unknown[]) => {
    // El modelo simulado captura lo que se intenta guardar.
    const ModeloSimulado = function (this: unknown, datos: never) {
      Object.assign(this as object, datos);
      guardado = datos as unknown as Record<string, unknown>;
      (this as { save: () => unknown }).save = () =>
        Promise.resolve({ ...(datos as object), _id: 'id-instancia' });
    } as unknown as new (datos: unknown) => unknown;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstancesService,
        { provide: getModelToken(Instance.name), useValue: ModeloSimulado },
        {
          provide: TemplatesService,
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue({ sections: seccionesPlantilla }),
          },
        },
      ],
    }).compile();

    servicio = module.get<InstancesService>(InstancesService);
  };

  const crear = (secciones: unknown[]) =>
    servicio.create({
      templateId: '507f1f77bcf86cd799439011',
      sections: secciones,
    } as unknown as CreateInstanceDto);

  beforeEach(() => {
    guardado = {};
  });

  describe('validacion contra la plantilla', () => {
    it('rechaza una seccion que no existe en la plantilla', async () => {
      await construir([seccionPlantilla('s1', 10)]);

      await expect(
        crear([respuestas('inventada', [5])]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el mensaje dice cual es la seccion sobrante', async () => {
      await construir([seccionPlantilla('s1', 10)]);

      await expect(crear([respuestas('s-fantasma', [5])])).rejects.toThrow(
        /s-fantasma/,
      );
    });
  });

  describe('puntos por pregunta', () => {
    it('suma las respuestas numericas', async () => {
      await construir([seccionPlantilla('s1', 15)]);

      await crear([respuestas('s1', [5, 4, 3])]);

      expect(guardado.totalObtainedPoints).toBe(12);
    });

    it('acepta la respuesta como texto', async () => {
      await construir([seccionPlantilla('s1', 10)]);

      await crear([respuestas('s1', ['5', '3'])]);

      expect(guardado.totalObtainedPoints).toBe(8);
    });

    it('«N/A» vale 0 puntos y se cuenta aparte', async () => {
      await construir([seccionPlantilla('s1', 15)]);

      await crear([respuestas('s1', [5, 'N/A', 4])]);

      expect(guardado.totalObtainedPoints).toBe(9);
      expect(guardado.totalNaCount).toBe(1);
    });

    it('una respuesta que no es numero vale 0, no NaN', async () => {
      // Un NaN se propagaria a todos los totales y al porcentaje.
      await construir([seccionPlantilla('s1', 10)]);

      await crear([respuestas('s1', ['sin responder', 5])]);

      expect(guardado.totalObtainedPoints).toBe(5);
      expect(Number.isNaN(guardado.totalObtainedPoints as number)).toBe(false);
    });
  });

  describe('porcentaje de cumplimiento', () => {
    it('es obtenido sobre aplicable, en porcentaje', async () => {
      await construir([seccionPlantilla('s1', 20)]);

      await crear([respuestas('s1', [5, 5])]); // 10 de 20

      expect(guardado.overallCompliancePercentage).toBe(50);
    });

    it('se redondea a dos decimales', async () => {
      await construir([seccionPlantilla('s1', 3)]);

      await crear([respuestas('s1', [1])]); // 1/3 = 33,333...

      expect(guardado.overallCompliancePercentage).toBe(33.33);
    });

    it('sin puntos aplicables da 0, no una division por cero', async () => {
      await construir([seccionPlantilla('s1', 0)]);

      await crear([respuestas('s1', [0])]);

      expect(guardado.overallCompliancePercentage).toBe(0);
      expect(
        Number.isFinite(guardado.overallCompliancePercentage as number),
      ).toBe(true);
    });

    it('marcar «N/A» NO penaliza: baja tambien el denominador', async () => {
      // Una pregunta que no aplica sale del calculo por completo. Antes se
      // quedaba en el denominador y penalizaba igual que un cero.
      await construir([seccionPlantilla('s1', 10, 2)]); // 5 puntos por pregunta

      await crear([respuestas('s1', [5, 'N/A'])]);

      expect(guardado.totalApplicablePoints).toBe(5); // 10 - 1 x 5
      expect(guardado.overallCompliancePercentage).toBe(100); // 5 de 5
    });

    it('una seccion entera en N/A no aporta puntos aplicables', async () => {
      await construir([seccionPlantilla('s1', 9, 3)]);

      await crear([respuestas('s1', ['N/A', 'N/A', 'N/A'])]);

      expect(guardado.totalApplicablePoints).toBe(0);
      // Sin nada que cumplir, el porcentaje es 0 por convenio — no NaN.
      expect(guardado.overallCompliancePercentage).toBe(0);
    });

    it('los puntos aplicables nunca bajan de cero', async () => {
      // Mas N/A que preguntas declaradas en la plantilla no debe dar negativo.
      await construir([seccionPlantilla('s1', 6, 2)]);

      await crear([respuestas('s1', ['N/A', 'N/A', 'N/A'])]);

      expect(guardado.totalApplicablePoints).toBe(0);
    });

    it('el valor de cada pregunta sale de la plantilla, no de un 3 fijo', async () => {
      // Una plantilla con otra escala tiene que seguir saliendo bien.
      await construir([seccionPlantilla('s1', 20, 4)]); // 5 por pregunta

      await crear([respuestas('s1', [5, 5, 5, 'N/A'])]);

      expect(guardado.totalApplicablePoints).toBe(15); // 20 - 5
      expect(guardado.overallCompliancePercentage).toBe(100);
    });
  });

  describe('totales entre secciones', () => {
    it('suma los puntos de todas las secciones', async () => {
      await construir([seccionPlantilla('s1', 10), seccionPlantilla('s2', 20)]);

      await crear([respuestas('s1', [5]), respuestas('s2', [10, 5])]);

      expect(guardado.totalObtainedPoints).toBe(20); // 5 + 15
      expect(guardado.totalMaxPoints).toBe(30); // 10 + 20
      expect(guardado.overallCompliancePercentage).toBeCloseTo(66.67);
    });

    it('acumula los N/A de todas las secciones', async () => {
      await construir([seccionPlantilla('s1', 10), seccionPlantilla('s2', 10)]);

      await crear([
        respuestas('s1', ['N/A', 5]),
        respuestas('s2', ['N/A', 'N/A']),
      ]);

      expect(guardado.totalNaCount).toBe(3);
    });
  });

  describe('valores por defecto', () => {
    it('una instancia nace como borrador', async () => {
      await construir([seccionPlantilla('s1', 10)]);

      await crear([respuestas('s1', [5])]);

      expect(guardado.status).toBe('borrador');
    });

    it('sin autor identificado se registra como «system»', async () => {
      await construir([seccionPlantilla('s1', 10)]);

      await crear([respuestas('s1', [5])]);

      expect(guardado.createdBy).toBe('system');
    });
  });
});

describe('InstancesService · terminar la inspeccion', () => {
  const plantilla = {
    sections: [seccionPlantilla('s1', 6)],
    verificationFields: [{ label: 'Área', required: true }],
  };

  const construir = async () => {
    const ModeloSimulado = function (this: unknown, datos: never) {
      Object.assign(this as object, datos);
      (this as { save: () => unknown }).save = () =>
        Promise.resolve({ ...(datos as object), _id: 'id-instancia' });
    } as unknown as new (datos: unknown) => unknown;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstancesService,
        { provide: getModelToken(Instance.name), useValue: ModeloSimulado },
        {
          provide: TemplatesService,
          useValue: { findOne: jest.fn().mockResolvedValue(plantilla) },
        },
      ],
    }).compile();
    const servicio = module.get<InstancesService>(InstancesService);
    const oyente = jest.fn().mockResolvedValue(undefined);
    servicio.alTerminar(oyente);
    return { servicio, oyente };
  };

  const crear = (
    servicio: InstancesService,
    valores: (number | string)[],
    status?: string,
  ) =>
    servicio.create({
      templateId: '507f1f77bcf86cd799439011',
      verificationList: { Área: 'Flotación' },
      inspectionTeam: [{ nombre: 'Ana', cargo: 'Supervisora', firma: 'f' }],
      sections: [respuestas('s1', valores)],
      status,
    } as unknown as CreateInstanceDto);

  it('guardar avance acepta preguntas sin responder y no genera nada', async () => {
    const { servicio, oyente } = await construir();

    await crear(servicio, [3, ''], 'borrador');

    expect(oyente).not.toHaveBeenCalled();
  });

  it('terminar con preguntas sin responder da 400 y dice cuantas faltan', async () => {
    const { servicio, oyente } = await construir();

    await expect(crear(servicio, [3, ''], 'completado')).rejects.toThrow(
      'Falta responder 1 pregunta',
    );
    expect(oyente).not.toHaveBeenCalled();
  });

  it('terminar completa avisa una vez, con el id de la inspeccion', async () => {
    const { servicio, oyente } = await construir();

    await crear(servicio, [3, 'N/A'], 'completado');

    expect(oyente).toHaveBeenCalledTimes(1);
    expect(oyente).toHaveBeenCalledWith('id-instancia');
  });

  it('si lo que sigue falla, la inspeccion se guarda igual', async () => {
    const { servicio, oyente } = await construir();
    oyente.mockRejectedValue(new Error('sin plantilla'));

    await expect(crear(servicio, [3, 3], 'completado')).resolves.toBeDefined();
  });
});

describe('InstancesService · filtro por plantilla y templateId', () => {
  const REV7 = '68ed4f7f4348e057d29cadfa';
  const REV8 = '6abbcf5b9eaa242f68c2f982';

  const construir = async () => {
    const cadena = (valor: unknown) => {
      const c: Record<string, jest.Mock> = {};
      for (const m of ['populate', 'sort', 'skip', 'limit']) {
        c[m] = jest.fn(() => c);
      }
      c.exec = jest.fn().mockResolvedValue(valor);
      return c;
    };
    const modelo = {
      find: jest.fn(() => cadena([])),
      countDocuments: jest.fn(() => cadena(0)),
      findById: jest.fn(() =>
        cadena({ status: 'borrador', templateId: { _id: REV8 } }),
      ),
      findByIdAndUpdate: jest.fn(() => cadena({ _id: 'i1' })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstancesService,
        { provide: getModelToken(Instance.name), useValue: modelo },
        {
          provide: TemplatesService,
          useValue: {
            idsDeLasRevisiones: jest.fn().mockResolvedValue([REV7, REV8]),
            findOne: jest.fn().mockResolvedValue({ sections: [] }),
          },
        },
      ],
    }).compile();
    return { servicio: module.get(InstancesService), modelo };
  };

  it('por código trae todas las revisiones, con el id como ObjectId o como texto', async () => {
    // La ISOP rev. 7 (obsoleta) tiene las inspecciones; la vigente es la 8.
    const { servicio, modelo } = await construir();

    await servicio.findAll({ templateCode: '1.02.P06.F12' });

    const query = (modelo.find.mock.calls as unknown[][])[0][0] as {
      templateId: { $in: unknown[] };
    };
    const ids = query.templateId.$in.map((v) => String(v));
    expect(ids).toEqual([REV7, REV7, REV8, REV8]);
    expect(query.templateId.$in.some((v) => typeof v === 'string')).toBe(true);
  });

  it('al editar, el templateId se guarda como ObjectId y no como texto', async () => {
    const { servicio, modelo } = await construir();

    await servicio.update('507f1f77bcf86cd799439011', {
      templateId: REV8,
    } as never);

    const cambios = (
      modelo.findByIdAndUpdate.mock.calls as unknown[][]
    )[0][1] as {
      templateId: unknown;
    };
    expect(typeof cambios.templateId).toBe('object');
    expect(String(cambios.templateId)).toBe(REV8);
  });

  it('al corregir los datos de la IRO avisa a su plan, con quien la edito', async () => {
    const { servicio } = await construir();
    const oyente = jest.fn().mockResolvedValue(undefined);
    servicio.alCambiarDatos(oyente);

    await servicio.update('507f1f77bcf86cd799439011', {
      verificationList: { Supervisor: 'Jhonny Eugenio' },
      updatedBy: 'eliodoro',
    } as never);

    expect(oyente).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'eliodoro');
  });
});
