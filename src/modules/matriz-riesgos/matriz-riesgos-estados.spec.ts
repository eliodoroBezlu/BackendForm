import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { MatrizRiesgosService } from './matriz-riesgos.service';
import { MatrizRiesgosImportService } from './matriz-riesgos-import.service';
import { EstadoMatriz, MatrizRiesgo } from './schemas/matriz-riesgo.schema';
import { Area } from '../area/schemas/area.schema';

interface RiesgoFalso {
  numero: number;
  /** Ausente = riesgo sin evaluar, que es uno de los casos a cubrir. */
  nivelActual?: string;
  controles: { verificador: string }[];
}

interface MatrizFalsa {
  _id: string;
  codigo: string;
  areaCodigo: string;
  anio: number;
  activo: boolean;
  estado: EstadoMatriz;
  actividades: ActividadFalsa[];
  historial: Record<string, unknown>[];
  revisadoAprobadoPor?: string;
  fechaAprobacion?: Date;
  save: jest.Mock;
  toObject(): unknown;
}

interface ActividadFalsa {
  numero: number;
  areaProcesoAlcance: string;
  actividadTarea: string;
  condicion: string;
  categoria: string;
  riesgos: RiesgoFalso[];
}

/**
 * Envuelve unos riesgos en una única actividad.
 *
 * Los riesgos ya no cuelgan de la matriz sino de una actividad, así que los
 * tests que solo se interesan por el contenido de los riesgos usan esto para
 * no repetir el encabezado.
 */
const enActividad = (riesgos: RiesgoFalso[]): ActividadFalsa[] => [
  {
    numero: 1,
    areaProcesoAlcance: 'Mantenimiento Chancador',
    actividadTarea: 'Desmontaje y montaje de componentes',
    condicion: 'Normal',
    categoria: 'Seguridad',
    riesgos,
  },
];

/** Riesgo mínimo válido: evaluado y con un control con verificador. */
const riesgoOk = (numero: number, nivel = 'SUSTANCIAL'): RiesgoFalso => ({
  numero,
  nivelActual: nivel,
  controles: [{ verificador: 'Seguimiento al programa de inspecciones ISOP' }],
});

/**
 * Documento de Mongoose simulado: `historial` y `estado` son mutables y
 * `save()` no hace nada, que es todo lo que la lógica de estados necesita.
 */
function matrizFalsa(over: Partial<MatrizFalsa> = {}): MatrizFalsa {
  const doc: MatrizFalsa = {
    _id: 'm1',
    codigo: 'MR-3310-2024-v1',
    areaCodigo: '3310',
    anio: 2024,
    activo: true,
    estado: EstadoMatriz.BORRADOR,
    actividades: enActividad([riesgoOk(1), riesgoOk(2)]),
    historial: [{ usuario: 'elaborador', fecha: new Date() }],
    save: jest.fn(() => Promise.resolve()),
    // Devuelve el propio documento: los tests inspeccionan las mutaciones
    // sobre `doc`, así que basta con que la referencia sea la misma.
    toObject: () => doc,
    ...over,
  };
  return doc;
}

describe('MatrizRiesgosService — flujo de estados', () => {
  let servicio: MatrizRiesgosService;
  let matriz: MatrizFalsa;
  let superadas: number;

  const montar = async () => {
    superadas = 0;
    const matrizModel = {
      findById: jest.fn(() => ({
        exec: jest.fn(() => Promise.resolve(matriz)),
        lean: jest.fn().mockReturnThis(),
      })),
      updateMany: jest.fn(() => {
        superadas = 1;
        return Promise.resolve({ modifiedCount: superadas });
      }),
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(() => Promise.resolve([])),
      })),
      create: jest.fn(),
    };
    const areaModel = {
      find: jest.fn(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(() => Promise.resolve([])),
      })),
    };

    const modulo = await Test.createTestingModule({
      providers: [
        MatrizRiesgosService,
        MatrizRiesgosImportService,
        { provide: getModelToken(MatrizRiesgo.name), useValue: matrizModel },
        { provide: getModelToken(Area.name), useValue: areaModel },
      ],
    }).compile();
    servicio = modulo.get(MatrizRiesgosService);
  };

  beforeEach(async () => {
    matriz = matrizFalsa();
    await montar();
  });

  describe('enviarARevision', () => {
    it('pasa de BORRADOR a EN_REVISION y deja historial', async () => {
      await servicio.enviarARevision('m1', 'ana', 'lista para revisar');

      expect(matriz.estado).toBe(EstadoMatriz.EN_REVISION);
      const ultima = matriz.historial.at(-1) as Record<string, unknown>;
      expect(ultima.usuario).toBe('ana');
      expect(ultima.estadoAnterior).toBe(EstadoMatriz.BORRADOR);
      expect(ultima.observaciones).toBe('lista para revisar');
    });

    it('rechaza si no está en borrador', async () => {
      matriz.estado = EstadoMatriz.APROBADA;
      await expect(servicio.enviarARevision('m1', 'ana')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rechaza una matriz sin riesgos', async () => {
      matriz.actividades = [];
      await expect(servicio.enviarARevision('m1', 'ana')).rejects.toThrow(
        /sin riesgos/i,
      );
    });
  });

  describe('aprobar — separación elaborador/aprobador', () => {
    beforeEach(() => {
      matriz.estado = EstadoMatriz.EN_REVISION;
    });

    it('quien elaboró la matriz no puede aprobarla', async () => {
      // El propio formulario separa "Elaborado por" de "Revisado y Aprobado
      // por": la regla viene del documento, no es un invento del sistema.
      await expect(servicio.aprobar('m1', 'elaborador', false)).rejects.toThrow(
        /vos mismo elaboraste/i,
      );
      expect(matriz.estado).toBe(EstadoMatriz.EN_REVISION);
    });

    it('otra persona sí puede', async () => {
      await servicio.aprobar('m1', 'jefe', false, 'revisada');
      expect(matriz.estado).toBe(EstadoMatriz.APROBADA);
      expect(matriz.revisadoAprobadoPor).toBe('jefe');
      expect(matriz.fechaAprobacion).toBeInstanceOf(Date);
    });

    it('el admin puede saltarse la separación', async () => {
      await servicio.aprobar('m1', 'elaborador', true);
      expect(matriz.estado).toBe(EstadoMatriz.APROBADA);
    });
  });

  describe('aprobar — validaciones de contenido', () => {
    beforeEach(() => {
      matriz.estado = EstadoMatriz.EN_REVISION;
    });

    it('rechaza riesgos sin evaluar', async () => {
      matriz.actividades = enActividad([{ numero: 3, controles: [] }]);
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /sin evaluar/i,
      );
    });

    it('rechaza un INACEPTABLE sin ningún control', async () => {
      // Aprobarlo sería dejar constancia formal de que nadie hace nada.
      matriz.actividades = enActividad([
        { numero: 4, nivelActual: 'INACEPTABLE', controles: [] },
      ]);
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /INACEPTABLE sin ningún control/i,
      );
    });

    it('rechaza controles sin verificador', async () => {
      matriz.actividades = enActividad([
        { numero: 5, nivelActual: 'BAJA', controles: [{ verificador: '' }] },
      ]);
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /sin verificador/i,
      );
    });

    it('detecta actividades que son la misma escrita distinto', async () => {
      // Caso real de la matriz de Chancado: los riesgos 37 y 38-44 quedaron
      // partidos en dos actividades por un singular/plural del Excel origen.
      matriz.actividades = [
        {
          numero: 1,
          areaProcesoAlcance: 'Mantenimiento Chancador',
          actividadTarea: 'Trabajo en Taller',
          condicion: 'Normal',
          categoria: 'Seguridad',
          riesgos: [riesgoOk(1)],
        },
        {
          numero: 2,
          areaProcesoAlcance: 'Mantenimiento Chancador',
          actividadTarea: 'Trabajos en Taller',
          condicion: 'Normal',
          categoria: 'Seguridad',
          riesgos: [riesgoOk(2)],
        },
      ];

      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /"Trabajo en Taller" vs "Trabajos en Taller"/,
      );
    });

    it('no confunde dos actividades que sí son distintas', async () => {
      matriz.actividades = [
        {
          numero: 1,
          areaProcesoAlcance: 'Mantenimiento Chancador',
          actividadTarea: 'Trabajos en Taller',
          condicion: 'Normal',
          categoria: 'Seguridad',
          riesgos: [riesgoOk(1)],
        },
        {
          numero: 2,
          areaProcesoAlcance: 'Mantenimiento Chancador',
          actividadTarea: 'Inspección Operacional',
          condicion: 'Normal',
          categoria: 'Seguridad',
          riesgos: [riesgoOk(2)],
        },
      ];

      await expect(
        servicio.aprobar('m1', 'jefe', false),
      ).resolves.toBeDefined();
    });

    it('acumula todos los problemas en un solo mensaje', async () => {
      matriz.actividades = enActividad([
        { numero: 6, controles: [] },
        { numero: 7, nivelActual: 'INACEPTABLE', controles: [] },
      ]);
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /sin evaluar[\s\S]*INACEPTABLE/i,
      );
    });
  });

  describe('aprobar — versionado', () => {
    it('marca como SUPERADA la versión anterior de la misma área y año', async () => {
      matriz.estado = EstadoMatriz.EN_REVISION;
      await servicio.aprobar('m1', 'jefe', false);
      // Solo puede haber una matriz vigente por área y año.
      expect(superadas).toBe(1);
    });

    it('no se puede aprobar dos veces', async () => {
      matriz.estado = EstadoMatriz.APROBADA;
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        /ya está aprobada/i,
      );
    });

    it('no se puede aprobar directamente desde borrador', async () => {
      matriz.estado = EstadoMatriz.BORRADOR;
      await expect(servicio.aprobar('m1', 'jefe', false)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('devolverACorregir', () => {
    it('vuelve a BORRADOR con el motivo en el historial', async () => {
      matriz.estado = EstadoMatriz.EN_REVISION;
      await servicio.devolverACorregir('m1', 'jefe', 'faltan controles');

      expect(matriz.estado).toBe(EstadoMatriz.BORRADOR);
      const ultima = matriz.historial.at(-1) as Record<string, unknown>;
      expect(ultima.observaciones).toBe('faltan controles');
    });

    it('solo desde EN_REVISION', async () => {
      await expect(servicio.devolverACorregir('m1', 'jefe')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('accionesDisponibles', () => {
    it('en borrador solo permite enviar a revisión', async () => {
      const a = await servicio.accionesDisponibles('m1', 'ana', false, true);
      expect(a).toMatchObject({
        puedeEnviarARevision: true,
        puedeAprobar: false,
        puedeDevolver: false,
      });
    });

    it('en revisión permite aprobar y devolver a quien tiene el rol', async () => {
      matriz.estado = EstadoMatriz.EN_REVISION;
      const a = await servicio.accionesDisponibles('m1', 'jefe', false, true);
      expect(a).toMatchObject({
        puedeEnviarARevision: false,
        puedeAprobar: true,
        puedeDevolver: true,
      });
    });

    it('explica por qué no se puede aprobar, en vez de solo deshabilitar', async () => {
      matriz.estado = EstadoMatriz.EN_REVISION;
      const a = await servicio.accionesDisponibles(
        'm1',
        'elaborador',
        false,
        true,
      );
      expect(a.puedeAprobar).toBe(false);
      expect(a.impedimentosParaAprobar.join(' ')).toMatch(/elaboraste/i);
    });

    it('sin rol de aprobación no habilita aprobar aunque el contenido esté bien', async () => {
      matriz.estado = EstadoMatriz.EN_REVISION;
      const a = await servicio.accionesDisponibles('m1', 'jefe', false, false);
      expect(a.puedeAprobar).toBe(false);
      expect(a.puedeDevolver).toBe(false);
    });
  });
});
