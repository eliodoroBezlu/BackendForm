import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MatrizRiesgosService } from './matriz-riesgos.service';
import { MatrizRiesgosImportService } from './matriz-riesgos-import.service';
import { MatrizRiesgo } from './schemas/matriz-riesgo.schema';
import { Area } from '../area/schemas/area.schema';

const ARCHIVO = 'Matriz de Riesgo Mantto  Planta Chancado (1).xlsx';
const buffer = () =>
  fs.readFileSync(path.join(process.cwd(), 'src', 'templates', ARCHIVO));

/** Área del maestro tal como la devolvería `populate('superintendencia')`. */
const areaMaestro = (over: Partial<Record<string, unknown>> = {}) => ({
  _id: 'area-1',
  codigo: '3320',
  nombre: 'Mantenimiento Chancado',
  activo: true,
  superintendencia: { nombre: 'SUPERINTENDENCIA DE MANTENIMIENTO MEC. PLTA.' },
  ...over,
});

describe('MatrizRiesgosService', () => {
  let servicio: MatrizRiesgosService;
  let areasEnMaestro: ReturnType<typeof areaMaestro>[];
  let matricesPrevias: Record<string, unknown>[];
  let creadas: Record<string, unknown>[];

  beforeEach(async () => {
    areasEnMaestro = [areaMaestro()];
    matricesPrevias = [];
    creadas = [];

    const matrizModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(() => Promise.resolve(matricesPrevias)),
      }),
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(() => Promise.resolve(null)),
      }),
      create: jest.fn((doc: Record<string, unknown>) => {
        creadas.push(doc);
        return Promise.resolve({ ...doc, _id: 'matriz-1' });
      }),
    };

    const areaModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(() => Promise.resolve(areasEnMaestro)),
      }),
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
  });

  describe('importar — resolución del área', () => {
    it('empareja el área del Excel con el maestro y usa SU superintendencia', async () => {
      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      expect(creadas).toHaveLength(1);
      expect(creadas[0].areaCodigo).toBe('3320');
      expect(creadas[0].areaNombre).toBe('Mantenimiento Chancado');
      expect(creadas[0].superintendencia).toBe(
        'SUPERINTENDENCIA DE MANTENIMIENTO MEC. PLTA.',
      );
      expect(r.codigo).toBe('MR-3320-2024-v1');
      expect(r.riesgosImportados).toBe(45);
      expect(r.controlesImportados).toBe(284);
      expect(r.requierenPgr).toBe(15);
    });

    it('rechaza si el área del archivo no está en el maestro', async () => {
      areasEnMaestro = [areaMaestro({ nombre: 'Otra área cualquiera' })];

      await expect(
        servicio.importar(buffer(), ARCHIVO, {}, 'juan'),
      ).rejects.toThrow(BadRequestException);
      // No se crean áreas al vuelo: el maestro llega sincronizado desde IAM.
      expect(creadas).toHaveLength(0);
    });

    it('empareja por coincidencia parcial: "Mantenimiento Chancado" → "Chancado"', async () => {
      // Caso real: el maestro nombra el área "Chancado" y el Excel la escribe
      // "Mantenimiento Chancado". Sin coincidencia parcial no se encontraría.
      areasEnMaestro = [areaMaestro({ codigo: '3310', nombre: 'Chancado' })];

      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');
      expect(r.codigo).toBe('MR-3310-2024-v1');
    });

    it('prefiere el duplicado que sí tiene código', async () => {
      // El maestro arrastra pares como "Generacion"/"Generación", donde solo
      // uno quedó emparejado por el sync con IAM.
      areasEnMaestro = [
        areaMaestro({ codigo: undefined, nombre: 'Chancado' }),
        areaMaestro({ codigo: '3310', nombre: 'Chancado' }),
      ];

      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');
      expect(r.codigo).toBe('MR-3310-2024-v1');
    });

    it('no elige al azar cuando hay varias candidatas distintas', async () => {
      areasEnMaestro = [
        areaMaestro({ codigo: '3310', nombre: 'Chancado' }),
        areaMaestro({ codigo: '3399', nombre: 'Mantenimiento' }),
      ];

      // Elegir mal mandaría la matriz al PGR de otra superintendencia.
      await expect(
        servicio.importar(buffer(), ARCHIVO, {}, 'juan'),
      ).rejects.toThrow(/coincide con varias áreas/i);
      expect(creadas).toHaveLength(0);
    });

    it('NO avisa por diferencias de abreviatura en la superintendencia', async () => {
      // El Excel escribe "MEC. PLANTA CHANCADO…" y el maestro "Mec. Plta.
      // Chancado…": es la misma, y una advertencia que salta en cada import es
      // una advertencia que nadie lee.
      areasEnMaestro = [
        areaMaestro({
          superintendencia: {
            nombre:
              'Superintendencia de Mantenimiento - Mec. Plta. Chancado, Molienda y Lubricación',
          },
        }),
      ];

      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');
      expect(r.advertencias.join(' ')).not.toContain('superintendencia');
    });

    it('avisa cuando la superintendencia del archivo no coincide con el maestro', async () => {
      areasEnMaestro = [
        areaMaestro({
          superintendencia: { nombre: 'SUPERINTENDENCIA DE MINA' },
        }),
      ];

      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      // Se usa la del maestro, pero no en silencio: de ella depende a qué PGR
      // se consolidará la matriz.
      expect(creadas[0].superintendencia).toBe('SUPERINTENDENCIA DE MINA');
      expect(r.advertencias.join(' ')).toContain('superintendencia');
    });

    it('permite forzar el área por código', async () => {
      areasEnMaestro = [
        areaMaestro(),
        areaMaestro({ _id: 'area-2', codigo: '9999', nombre: 'Molienda' }),
      ];

      const r = await servicio.importar(
        buffer(),
        ARCHIVO,
        { areaCodigo: '9999' },
        'juan',
      );

      expect(creadas[0].areaNombre).toBe('Molienda');
      expect(r.codigo).toBe('MR-9999-2024-v1');
    });

    it('rechaza un código de área inexistente', async () => {
      await expect(
        servicio.importar(buffer(), ARCHIVO, { areaCodigo: 'NOPE' }, 'juan'),
      ).rejects.toThrow(/no existe un área activa/i);
    });
  });

  describe('importar — versionado', () => {
    it('crea la v1 cuando no hay matrices previas', async () => {
      const r = await servicio.importar(buffer(), ARCHIVO, {}, 'juan');
      expect(r.version).toBe(1);
      expect(creadas[0].matrizAnteriorId).toBeUndefined();
    });

    it('rechaza con 409 si ya existe y no se pidió nueva versión', async () => {
      matricesPrevias = [{ _id: 'prev', version: 1, estado: 'APROBADA' }];

      await expect(
        servicio.importar(buffer(), ARCHIVO, {}, 'juan'),
      ).rejects.toThrow(ConflictException);
      expect(creadas).toHaveLength(0);
    });

    it('encadena la versión nueva con la anterior', async () => {
      matricesPrevias = [{ _id: 'prev', version: 2, estado: 'APROBADA' }];

      const r = await servicio.importar(
        buffer(),
        ARCHIVO,
        { nuevaVersion: true },
        'juan',
      );

      expect(r.version).toBe(3);
      expect(r.codigo).toBe('MR-3320-2024-v3');
      expect(creadas[0].matrizAnteriorId).toBe('prev');
    });
  });

  describe('importar — qué se persiste', () => {
    it('agrupa las filas planas del Excel en actividades', async () => {
      await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      const actividades = creadas[0].actividades as {
        actividadTarea: string;
        riesgos: unknown[];
      }[];

      // El archivo real repite el encabezado: 45 filas de riesgo que en verdad
      // son 8 tareas distintas.
      expect(actividades).toHaveLength(8);
      expect(actividades.reduce((n, a) => n + a.riesgos.length, 0)).toBe(45);
      expect(actividades[0].riesgos).toHaveLength(16);
      expect(actividades[0].actividadTarea).toMatch(/Desmontaje y montaje/);
    });

    it('el encabezado sube a la actividad y no se repite en cada riesgo', async () => {
      await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      const [actividad] = creadas[0].actividades as {
        areaProcesoAlcance: string;
        condicion: string;
        categoria: string;
        riesgos: Record<string, unknown>[];
      }[];

      expect(actividad.areaProcesoAlcance).toBeTruthy();
      expect(actividad.condicion).toBe('Normal');
      expect(actividad.categoria).toBe('Seguridad');
      for (const r of actividad.riesgos) {
        expect(r.actividadTarea).toBeUndefined();
        expect(r.categoria).toBeUndefined();
      }
    });

    it('guarda los derivados del motor, no los del Excel', async () => {
      await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      const riesgos = (
        creadas[0].actividades as { riesgos: Record<string, unknown>[] }[]
      ).flatMap((a) => a.riesgos);
      expect(riesgos).toHaveLength(45);
      for (const r of riesgos) {
        // Todo riesgo importado sale con sus 4 derivados resueltos.
        expect(r.probabilidad).toBeDefined();
        expect(r.resultado).toBeDefined();
        expect(r.nivelInicial).toBeDefined();
        expect(r.nivelActual).toBeDefined();
      }
    });

    it('nace en BORRADOR con su entrada de historial', async () => {
      await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      expect(creadas[0].estado).toBe('BORRADOR');
      const historial = creadas[0].historial as Record<string, unknown>[];
      expect(historial).toHaveLength(1);
      expect(historial[0].usuario).toBe('juan');
      expect(String(historial[0].observaciones)).toContain('45 riesgos');
    });

    it('conserva el archivo de origen y los firmantes de la cabecera', async () => {
      await servicio.importar(buffer(), ARCHIVO, {}, 'juan');

      expect(creadas[0].archivoOrigen).toBe(ARCHIVO);
      expect(creadas[0].elaboradoPor).toBeTruthy();
      expect(creadas[0].revisadoAprobadoPor).toBeTruthy();
      expect(creadas[0].anio).toBe(2024);
    });
  });

  describe('importar — archivos que no se deben guardar', () => {
    it('rechaza un Excel que no es una matriz', async () => {
      const otro = fs.readFileSync(
        path.join(process.cwd(), 'src', 'templates', 'Amoladora.xlsx'),
      );
      await expect(
        servicio.importar(otro, 'Amoladora.xlsx', {}, 'juan'),
      ).rejects.toThrow(/No se encontró la cabecera/i);
      expect(creadas).toHaveLength(0);
    });

    it('rechaza la plantilla vacía en vez de crear una matriz sin riesgos', async () => {
      const vacia = fs.readFileSync(
        path.join(
          process.cwd(),
          'src',
          'templates',
          '1.02.P06.F01_Identificacion_Evaluacion_Riesgos_Rev.7 (1).xlsx',
        ),
      );
      await expect(
        servicio.importar(vacia, 'plantilla.xlsx', {}, 'juan'),
      ).rejects.toThrow(/no contiene riesgos/i);
      expect(creadas).toHaveLength(0);
    });
  });
});
