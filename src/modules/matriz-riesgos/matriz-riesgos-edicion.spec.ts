import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MatrizRiesgosEdicionService } from './matriz-riesgos-edicion.service';
import { CatalogoRiesgo, TipoCatalogo } from './schemas/catalogo-riesgo.schema';
import { EstadoMatriz, MatrizRiesgo } from './schemas/matriz-riesgo.schema';
import { Area } from '../area/schemas/area.schema';
import { RiesgoDto } from './dto/riesgo.dto';

/** Control eficaz: jerarquía 2 con calidad A da «Control/Acción Eficaz». */
const controlEficaz = (verificador = 'Seguimiento a inspecciones') => ({
  familiaControl: 'Administrativo',
  medida: 'Capacitar sobre el instructivo',
  verificador,
  calidadControl: 'A. Mayor 80%',
  jerarquiaControl: '2. Administrativo/ Procedimientos/ Capacitación',
});

const ACTIVIDAD = {
  areaProcesoAlcance: 'Mantenimiento chancadora',
  actividadTarea: 'Cambio de muelas',
  condicion: 'Normal',
  categoria: 'Seguridad',
};

const riesgoDto = (over: Partial<RiesgoDto> = {}): RiesgoDto =>
  ({
    familiaPeligro: 'Trabajos en altura',
    descripcionPeligro: 'Plataforma sin barandas',
    familiaRiesgo: 'Caída de distinto nivel',
    descripcionRiesgo: 'Caída desde altura',
    // La escala va al revés de lo intuitivo: Exp=1, Pos=1 da la probabilidad
    // MÁS alta (5). Ver TABLA_PROBABILIDAD.
    exposicion: 1,
    posibilidad: 1,
    severidad: 5,
    controles: [controlEficaz()],
    ...over,
  }) as RiesgoDto;

describe('MatrizRiesgosEdicionService', () => {
  let servicio: MatrizRiesgosEdicionService;
  let matriz: Record<string, unknown> | null;
  let existeMatriz: boolean;
  let area: Record<string, unknown> | null;
  let catalogo: { tipo: TipoCatalogo; valor: string }[];
  let guardada: Record<string, unknown> | null;

  /** Los riesgos de la primera actividad, que es donde escriben los tests. */
  const riesgosDe = (m: Record<string, unknown> | null): unknown[] =>
    (m?.actividades as { riesgos: unknown[] }[])[0].riesgos;

  const matrizFalsa = (over: Record<string, unknown> = {}) => {
    const doc: Record<string, unknown> = {
      _id: 'mx-1',
      codigo: 'MR-3310-2026-v1',
      estado: EstadoMatriz.BORRADOR,
      activo: true,
      actividades: [
        { numero: 1, ...ACTIVIDAD, riesgos: [] as Record<string, unknown>[] },
      ],
      historial: [] as unknown[],
      save: jest.fn(() => Promise.resolve(doc)),
      ...over,
    };
    return doc;
  };

  beforeEach(async () => {
    matriz = matrizFalsa();
    existeMatriz = false;
    guardada = null;
    catalogo = [
      { tipo: TipoCatalogo.PELIGRO, valor: 'Trabajos en altura' },
      { tipo: TipoCatalogo.RIESGO, valor: 'Caída de distinto nivel' },
      { tipo: TipoCatalogo.VERIFICADOR, valor: 'Seguimiento a inspecciones' },
    ];
    area = {
      codigo: '3310',
      nombre: 'Chancado',
      superintendencia: { nombre: 'Superintendencia de Mantenimiento' },
    };

    // Constructor + estáticos del modelo de matriz.
    const matrizModel = function (this: Record<string, unknown>, datos: never) {
      Object.assign(this, datos);
      this.save = jest.fn(() => {
        // El alias es intencionado: se captura la instancia recien construida
        // para que la prueba pueda inspeccionar lo que se guardo.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        guardada = this;
        return Promise.resolve(this);
      });
    } as unknown as jest.Mock & Record<string, jest.Mock>;

    matrizModel.findById = jest.fn(() => ({
      exec: jest.fn(() => Promise.resolve(matriz)),
    }));
    matrizModel.exists = jest.fn(() => ({
      exec: jest.fn(() => Promise.resolve(existeMatriz ? { _id: 'x' } : null)),
    }));

    // El tipo de retorno es explicito porque la funcion se referencia a si
    // misma: sin anotacion, TypeScript no puede inferirlo (TS7023).
    interface CadenaDeConsulta {
      populate: jest.Mock;
      sort: jest.Mock;
      lean: jest.Mock;
      exec: jest.Mock;
    }

    const cadena = (valor: unknown): CadenaDeConsulta => ({
      populate: jest.fn(() => cadena(valor)),
      sort: jest.fn(() => cadena(valor)),
      lean: jest.fn(() => cadena(valor)),
      exec: jest.fn(() => Promise.resolve(valor)),
    });

    const areaModel = {
      findOne: jest.fn(() => cadena(area)),
      find: jest.fn(() => cadena(area ? [area] : [])),
    };
    const catalogoModel = { find: jest.fn(() => cadena(catalogo)) };

    const modulo = await Test.createTestingModule({
      providers: [
        MatrizRiesgosEdicionService,
        { provide: getModelToken(MatrizRiesgo.name), useValue: matrizModel },
        {
          provide: getModelToken(CatalogoRiesgo.name),
          useValue: catalogoModel,
        },
        { provide: getModelToken(Area.name), useValue: areaModel },
      ],
    }).compile();
    servicio = modulo.get(MatrizRiesgosEdicionService);
  });

  describe('crear', () => {
    it('arma el código a partir del área y el año', async () => {
      await servicio.crear({ areaCodigo: '3310', anio: 2026 }, 'ana');

      expect(guardada?.codigo).toBe('MR-3310-2026-v1');
      expect(guardada?.superintendencia).toBe(
        'Superintendencia de Mantenimiento',
      );
      expect(guardada?.estado).toBe(EstadoMatriz.BORRADOR);
      expect(guardada?.actividades).toEqual([]);
    });

    it('deja constancia de quién la creó', async () => {
      await servicio.crear({ areaCodigo: '3310', anio: 2026 }, 'ana');

      const historial = guardada?.historial as { usuario: string }[];
      expect(historial[0].usuario).toBe('ana');
      expect(guardada?.elaboradoPor).toBe('ana');
    });

    it('rechaza un área que no está en el maestro', async () => {
      area = null;
      await expect(
        servicio.crear({ areaCodigo: 'XXXX', anio: 2026 }, 'ana'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza un área sin superintendencia: no habría PGR destino', async () => {
      area = { codigo: '3310', nombre: 'Chancado', superintendencia: null };
      await expect(
        servicio.crear({ areaCodigo: '3310', anio: 2026 }, 'ana'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no permite dos matrices del mismo área y año', async () => {
      existeMatriz = true;
      await expect(
        servicio.crear({ areaCodigo: '3310', anio: 2026 }, 'ana'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('actividades', () => {
    it('agrega una actividad vacía y la numera', async () => {
      await servicio.agregarActividad(
        'mx-1',
        { ...ACTIVIDAD, actividadTarea: 'Inspección operacional' },
        'ana',
      );

      const acts = matriz!.actividades as { numero: number }[];
      expect(acts.map((a) => a.numero)).toEqual([1, 2]);
    });

    it('rechaza duplicar la misma actividad', async () => {
      // Los cuatro campos del encabezado identifican la actividad.
      await expect(
        servicio.agregarActividad('mx-1', { ...ACTIVIDAD }, 'ana'),
      ).rejects.toThrow(ConflictException);
    });

    it('la misma tarea con otra categoría es otra actividad', async () => {
      await servicio.agregarActividad(
        'mx-1',
        { ...ACTIVIDAD, categoria: 'Medio Ambiente' },
        'ana',
      );
      expect(matriz!.actividades as unknown[]).toHaveLength(2);
    });

    it('renombrar el encabezado no toca los riesgos', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      await servicio.actualizarActividad(
        'mx-1',
        1,
        { ...ACTIVIDAD, actividadTarea: 'Trabajos en Taller' },
        'ana',
      );

      const [act] = matriz!.actividades as {
        actividadTarea: string;
        riesgos: unknown[];
      }[];
      expect(act.actividadTarea).toBe('Trabajos en Taller');
      expect(act.riesgos).toHaveLength(1);
    });

    it('borrar la actividad se lleva sus riesgos', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      await servicio.eliminarActividad('mx-1', 1, 'ana');

      expect(matriz!.actividades as unknown[]).toHaveLength(0);
    });

    it('falla si la actividad no existe', async () => {
      await expect(
        servicio.agregarRiesgo('mx-1', 99, riesgoDto(), 'ana'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('agregarRiesgo', () => {
    it('numera de forma global, no por actividad', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');
      await servicio.agregarActividad(
        'mx-1',
        { ...ACTIVIDAD, actividadTarea: 'Otra tarea' },
        'ana',
      );
      await servicio.agregarRiesgo('mx-1', 2, riesgoDto(), 'ana');

      // El correlativo es de la matriz entera, como la columna A del Excel:
      // el PGR referencia ese número.
      const acts = matriz!.actividades as { riesgos: { numero: number }[] }[];
      expect(acts[0].riesgos.map((r) => r.numero)).toEqual([1]);
      expect(acts[1].riesgos.map((r) => r.numero)).toEqual([2]);
    });

    it('numera correlativamente', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      const riesgos = riesgosDe(matriz) as { numero: number }[];
      expect(riesgos.map((r) => r.numero)).toEqual([1, 2]);
    });

    it('calcula los derivados en el servidor', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      const [r] = riesgosDe(matriz) as Record<string, unknown>[];
      // Exp 1 × Pos 1 → probabilidad 5; × severidad 5 → resultado 25.
      expect(r.probabilidad).toBe(5);
      expect(r.resultado).toBe(25);
      expect(r.nivelInicial).toBe('INACEPTABLE');
      // Un control eficaz baja un nivel.
      expect(r.nivelActual).toBe('SUSTANCIAL');
    });

    it('calcula la eficacia de cada control e ignora la que venga del cliente', async () => {
      const conEficaciaFalsa = riesgoDto({
        controles: [
          {
            ...controlEficaz(),
            calidadControl: 'C. Menor a 50%',
            // Un cliente malicioso podría mandar esto; el DTO ni lo declara.
            eficacia: 'Control/Acción Eficaz',
          } as never,
        ],
      });

      await servicio.agregarRiesgo('mx-1', 1, conEficaciaFalsa, 'ana');

      const [r] = riesgosDe(matriz) as { controles: { eficacia: string }[] }[];
      expect(r.controles[0].eficacia).toBe('Control/Acción No Eficaz');
    });

    it('no deja editar una matriz que ya no está en BORRADOR', async () => {
      matriz = matrizFalsa({ estado: EstadoMatriz.APROBADA });
      await expect(
        servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana'),
      ).rejects.toThrow(/BORRADOR/i);
    });

    it('falla si la matriz no existe', async () => {
      matriz = null;
      await expect(
        servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarRiesgo', () => {
    it('reevalúa al cambiar los controles', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      // Dos controles eficaces bajan dos niveles desde INACEPTABLE.
      await servicio.actualizarRiesgo(
        'mx-1',
        1,
        1,
        riesgoDto({
          controles: [controlEficaz('V1'), controlEficaz('V2')],
        }),
        'ana',
      );

      const [r] = riesgosDe(matriz) as Record<string, unknown>[];
      expect(r.nivelInicial).toBe('INACEPTABLE');
      // INACEPTABLE − 2 escalones = ACEPTABLE CON REVISIÓN.
      expect(r.nivelActual).toBe('ACEPTABLE CON REVISIÓN');
    });

    it('conserva el número del riesgo', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');

      await servicio.actualizarRiesgo(
        'mx-1',
        1,
        2,
        riesgoDto({ descripcionRiesgo: 'Otro texto' }),
        'ana',
      );

      const riesgos = riesgosDe(matriz) as {
        numero: number;
        descripcionRiesgo: string;
      }[];
      expect(riesgos.map((r) => r.numero)).toEqual([1, 2]);
      expect(riesgos[1].descripcionRiesgo).toBe('Otro texto');
    });

    it('falla si ese número no existe', async () => {
      await expect(
        servicio.actualizarRiesgo('mx-1', 1, 99, riesgoDto(), 'ana'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('eliminarRiesgo', () => {
    it('renumera para que la numeración siga siendo correlativa', async () => {
      await servicio.agregarRiesgo('mx-1', 1, riesgoDto(), 'ana');
      await servicio.agregarRiesgo(
        'mx-1',
        1,
        riesgoDto({ descripcionRiesgo: 'B' }),
        'ana',
      );
      await servicio.agregarRiesgo(
        'mx-1',
        1,
        riesgoDto({ descripcionRiesgo: 'C' }),
        'ana',
      );

      await servicio.eliminarRiesgo('mx-1', 1, 2, 'ana');

      const riesgos = riesgosDe(matriz) as {
        numero: number;
        descripcionRiesgo: string;
      }[];
      expect(riesgos.map((r) => r.numero)).toEqual([1, 2]);
      expect(riesgos.map((r) => r.descripcionRiesgo)).toEqual([
        'Caída desde altura',
        'C',
      ]);
    });

    it('falla si ese número no existe', async () => {
      await expect(
        servicio.eliminarRiesgo('mx-1', 1, 7, 'ana'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('opcionesDeCategoria', () => {
    it('ordena la jerarquía de 6 a 1, que es su orden semántico', async () => {
      const op = await servicio.opcionesDeCategoria('Seguridad');

      expect(op.jerarquias[0]).toMatch(/^6\./);
      expect(op.jerarquias[5]).toMatch(/^1\./);
    });

    it('usa la jerarquía especial de DSRC', async () => {
      const op = await servicio.opcionesDeCategoria('DSRC/Estratégico');

      expect(op.jerarquias[0]).toMatch(/Acuerdos estratégicos/);
    });

    it('avisa cuando la categoría no tiene catálogo cargado', async () => {
      // Salud, Legal, Rel. Gubernamentales y Financiero quedaron sin datos en
      // el formulario original: la UI tiene que dejar escribir a mano.
      catalogo = [];
      const op = await servicio.opcionesDeCategoria('Salud');

      expect(op.sinCatalogo).toBe(true);
      expect(op.peligros).toEqual([]);
      // Las listas que no dependen del catálogo siguen estando.
      expect(op.calidades.length).toBe(3);
      expect(op.jerarquias.length).toBe(6);
    });

    it('rechaza una categoría inventada', async () => {
      await expect(servicio.opcionesDeCategoria('Cualquiera')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
