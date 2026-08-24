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
