import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PgrConsolidacionService } from './pgr-consolidacion.service';
import { MatrizRiesgosService } from '../matriz-riesgos/matriz-riesgos.service';
import { Pgr, PgrEstado } from './schemas/pgr.schema';

const VERIF_ISOP = 'Seguimiento al programa de inspecciones ISOP';
const VERIF_IROS = 'Seguimiento al programa de inspecciones IRO´S: Altura';

const control = (verificador: string, medida: string) => ({
  familiaControl: 'Administrativo',
  medida,
  verificador,
  calidadControl: 'A. Mayor 80%',
  jerarquiaControl: '2. Administrativo/ Procedimientos/ Capacitación',
  eficacia: 'Control/Acción Eficaz',
});

const riesgo = (
  numero: number,
  nivelActual: string,
  controles: ReturnType<typeof control>[],
) => ({
  numero,
  descripcionRiesgo: `Riesgo ${numero}`,
  nivelActual,
  controles,
});

/**
 * Matriz con **una** actividad que contiene los riesgos dados.
 *
 * Los riesgos cuelgan de una actividad, no de la matriz. Para lo que prueban
 * estos tests —qué actividades del PGR salen de los controles— alcanza con
 * una sola, así que el encabezado se fija acá y no ensucia cada caso.
 */
const matriz = (
  areaCodigo: string,
  areaNombre: string,
  riesgos: ReturnType<typeof riesgo>[],
) => ({
  _id: `mx-${areaCodigo}`,
  codigo: `MR-${areaCodigo}-2026-v1`,
  areaCodigo,
  areaNombre,
  version: 1,
  superintendencia: 'Superintendencia de Mantenimiento',
  anio: 2026,
  actividades: [
    {
      numero: 1,
      areaProcesoAlcance: areaNombre,
      actividadTarea: `Mantenimiento ${areaNombre}`,
      condicion: 'Normal',
      categoria: 'Seguridad',
      riesgos,
    },
  ],
});

describe('PgrConsolidacionService', () => {
  let servicio: PgrConsolidacionService;
  let matricesAprobadas: ReturnType<typeof matriz>[];
  let pgr: Record<string, unknown> | null;

  const SUPER = 'Superintendencia de Mantenimiento';
  const PGR_ID = 'pgr-1';

  const pgrFalso = (over: Record<string, unknown> = {}) => ({
    _id: 'pgr-1',
    codigoAutogenerado: 'PGR-2026-001',
    superintendencia: SUPER,
    gestion: '2026',
    estado: PgrEstado.BORRADOR,
    activo: true,
    areas: [] as string[],
    actividades: [] as Record<string, unknown>[],
    save: jest.fn(() => Promise.resolve()),
    ...over,
  });

  beforeEach(async () => {
    matricesAprobadas = [];
    pgr = pgrFalso();

    const pgrModel = {
      findById: jest.fn(() => ({ exec: jest.fn(() => Promise.resolve(pgr)) })),
    };
    const matrizService = {
      aprobadasDeSuperintendencia: jest.fn(() =>
        Promise.resolve(matricesAprobadas),
      ),
    };

    const modulo = await Test.createTestingModule({
      providers: [
        PgrConsolidacionService,
        { provide: getModelToken(Pgr.name), useValue: pgrModel },
        { provide: MatrizRiesgosService, useValue: matrizService },
      ],
    }).compile();
    servicio = modulo.get(PgrConsolidacionService);
  });

  describe('previsualizar — derivación', () => {
    it('solo toma los riesgos SUSTANCIAL e INACEPTABLE', async () => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'INACEPTABLE', [control(VERIF_ISOP, 'Inspeccionar')]),
          riesgo(2, 'BAJA', [control(VERIF_IROS, 'Otra cosa')]),
          riesgo(3, 'ACEPTABLE', [control(VERIF_IROS, 'Otra más')]),
        ]),
      ];

      const vista = await servicio.previsualizar(PGR_ID);

      expect(vista.propuestas).toHaveLength(1);
      expect(vista.propuestas[0].verificador).toBe(VERIF_ISOP);
    });

    it('propone el texto de la medida como descripción de la actividad', async () => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [
            control(VERIF_ISOP, 'Capacitar sobre el instructivo de altura'),
          ]),
        ]),
      ];

      const vista = await servicio.previsualizar(PGR_ID);
      // Es una propuesta editable: en el PGR real el texto está reformulado.
      expect(vista.propuestas[0].descripcion).toBe(
        'Capacitar sobre el instructivo de altura',
      );
    });

    it('ignora controles sin verificador', async () => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control('', 'Sin forma de medirlo')]),
        ]),
      ];
      const vista = await servicio.previsualizar(PGR_ID);
      expect(vista.propuestas).toHaveLength(0);
    });
  });

  describe('previsualizar — consolidación entre áreas', () => {
    beforeEach(() => {
      // Dos áreas de la misma superintendencia declaran el MISMO verificador
      // y la misma medida: es el caso que justifica todo el diseño.
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control(VERIF_ISOP, 'Inspeccionar ISOP')]),
        ]),
        matriz('3338', 'Molienda', [
          riesgo(1, 'INACEPTABLE', [control(VERIF_ISOP, 'Inspeccionar ISOP')]),
        ]),
      ];
    });

    it('unifica en UNA actividad que cubre las dos áreas', async () => {
      const vista = await servicio.previsualizar(PGR_ID);

      expect(vista.propuestas).toHaveLength(1);
      expect(vista.propuestas[0].riesgosCubiertos).toHaveLength(2);
      expect(vista.propuestas[0].areas.sort()).toEqual([
        'Chancado',
        'Molienda',
      ]);
    });

    it('el nivel máximo se recalcula sobre TODAS las áreas', async () => {
      const vista = await servicio.previsualizar(PGR_ID);
      // Chancado aporta SUSTANCIAL y Molienda INACEPTABLE: gana el peor.
      expect(vista.propuestas[0].nivelRiesgoMaximo).toBe('INACEPTABLE');
    });

    it('con desdoblarPorArea mantiene una actividad por área', async () => {
      const vista = await servicio.previsualizar(PGR_ID, true);

      expect(vista.propuestas).toHaveLength(2);
      const verificadores = vista.propuestas.map((p) => p.verificador).sort();
      expect(verificadores[0]).toContain('AREA CHANCADO');
      expect(verificadores[1]).toContain('AREA MOLIENDA');
    });
  });

  describe('previsualizar — efecto sobre un PGR existente', () => {
    it('marca "nueva" lo que todavía no está', async () => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control(VERIF_ISOP, 'Inspeccionar')]),
        ]),
      ];
      const vista = await servicio.previsualizar(PGR_ID);
      expect(vista.propuestas[0].efecto).toBe('nueva');
    });

    it('marca "sube-nivel" cuando una nueva área agrava el riesgo', async () => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control(VERIF_ISOP, 'Inspeccionar')]),
        ]),
        matriz('3338', 'Molienda', [
          riesgo(1, 'INACEPTABLE', [control(VERIF_ISOP, 'Inspeccionar')]),
        ]),
      ];
      const previa = await servicio.previsualizar(PGR_ID);
      pgr = pgrFalso({
        areas: ['Chancado'],
        actividades: [
          {
            descripcion: 'Inspeccionar',
            verificador: VERIF_ISOP,
            origenMatriz: {
              clave: previa.propuestas[0].clave,
              riesgosCubiertos: [{ nivelActual: 'SUSTANCIAL' }],
              nivelRiesgoMaximo: 'SUSTANCIAL',
            },
          },
        ],
      });

      const vista = await servicio.previsualizar(PGR_ID);
      expect(vista.propuestas[0].efecto).toBe('sube-nivel');
    });

    it('falla si el PGR destino no existe', async () => {
      pgr = null;
      await expect(servicio.previsualizar(PGR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falla si el PGR destino está dado de baja', async () => {
      pgr = pgrFalso({ activo: false });
      await expect(servicio.previsualizar(PGR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('no da por consolidada un área que solo viene del maestro', async () => {
      // Al crearse, el PGR copia todas las áreas que el maestro le asigna a la
      // superintendencia. Ninguna de ellas aportó actividades todavía.
      pgr = pgrFalso({ areas: ['Maq Herramientas', 'Molienda'] });
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control(VERIF_ISOP, 'Inspeccionar')]),
        ]),
      ];

      const vista = await servicio.previsualizar(PGR_ID);
      expect(vista.areasYaConsolidadas).toEqual([]);
    });

    it('avisa cuando no hay matrices aprobadas', async () => {
      const vista = await servicio.previsualizar(PGR_ID);
      expect(vista.advertencias.join(' ')).toMatch(
        /No hay matrices aprobadas/i,
      );
    });
  });

  describe('consolidar', () => {
    beforeEach(() => {
      matricesAprobadas = [
        matriz('3310', 'Chancado', [
          riesgo(1, 'SUSTANCIAL', [control(VERIF_ISOP, 'Inspeccionar ISOP')]),
          riesgo(2, 'INACEPTABLE', [control(VERIF_IROS, 'Inspeccionar IRO')]),
        ]),
      ];
    });

    it('crea las actividades y registra el área consolidada', async () => {
      const r = await servicio.consolidar(PGR_ID, 'ana');

      expect(r.actividadesNuevas).toBe(2);
      expect(r.actividadesActualizadas).toBe(0);
      expect(r.areasConsolidadas).toEqual(['Chancado']);
      expect((pgr!.actividades as unknown[]).length).toBe(2);
    });

    it('las actividades nacen sin responsable: eso no sale de la matriz', async () => {
      await servicio.consolidar(PGR_ID, 'ana');
      const act = (pgr!.actividades as Record<string, unknown>[])[0];
      expect(act.responsable).toBeUndefined();
      expect(act.origenMatriz).toBeDefined();
    });

    it('es idempotente: repetirla no duplica actividades', async () => {
      await servicio.consolidar(PGR_ID, 'ana');
      const r2 = await servicio.consolidar(PGR_ID, 'ana');

      expect(r2.actividadesNuevas).toBe(0);
      expect(r2.actividadesActualizadas).toBe(2);
      expect((pgr!.actividades as unknown[]).length).toBe(2);
    });

    it('es incremental: al sumar un área acumula sin pisar lo escrito', async () => {
      await servicio.consolidar(PGR_ID, 'ana');

      // Se busca por verificador y no por índice: la previsualización ordena
      // por gravedad, así que el orden del array no es el de creación.
      const act = (pgr!.actividades as Record<string, unknown>[]).find(
        (a) => a.verificador === VERIF_ISOP,
      )!;

      // El planificador completa la actividad…
      act.responsable = 'Jefe de Mantenimiento';
      act.descripcion = 'Difundir el Instructivo de ISOP';

      // …y después aprueba otra área con el mismo verificador y medida.
      matricesAprobadas.push(
        matriz('3338', 'Molienda', [
          riesgo(1, 'INACEPTABLE', [control(VERIF_ISOP, 'Inspeccionar ISOP')]),
        ]),
      );
      const r = await servicio.consolidar(PGR_ID, 'ana');

      expect(r.actividadesNuevas).toBe(0);
      expect(r.areasConsolidadas.sort()).toEqual(['Chancado', 'Molienda']);
      // Lo que escribió el planificador se respeta.
      expect(act.responsable).toBe('Jefe de Mantenimiento');
      expect(act.descripcion).toBe('Difundir el Instructivo de ISOP');
      // Y el origen acumuló el riesgo de la segunda área.
      const origen = act.origenMatriz as {
        riesgosCubiertos: unknown[];
        nivelRiesgoMaximo: string;
      };
      expect(origen.riesgosCubiertos).toHaveLength(2);
      expect(origen.nivelRiesgoMaximo).toBe('INACEPTABLE');
    });

    it('no consolida en un PGR ya aprobado', async () => {
      pgr = pgrFalso({ estado: PgrEstado.APROBADO });
      // Meter programación nueva por detrás en un PGR aprobado sería cambiarlo
      // sin que nadie lo revise.
      await expect(servicio.consolidar(PGR_ID, 'ana')).rejects.toThrow(
        /está aprobado/i,
      );
    });

    it('falla si no existe el PGR', async () => {
      pgr = null;
      await expect(servicio.consolidar(PGR_ID, 'ana')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falla si no hay nada que consolidar', async () => {
      matricesAprobadas = [];
      await expect(servicio.consolidar(PGR_ID, 'ana')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza un PGR cuya gestión no es un año', async () => {
      pgr = pgrFalso({ gestion: 'no-es-un-año' });
      await expect(servicio.previsualizar(PGR_ID)).rejects.toThrow(
        /no es un año válido/i,
      );
    });
  });
});
