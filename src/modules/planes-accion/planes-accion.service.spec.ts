import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanesAccionService } from './planes-accion.service';
import { PlanDeAccion } from './schemas/plan-accion.schema';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';

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
