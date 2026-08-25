import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposSchema,
} from './schemas/inspection-herra-equipos.schema';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';

/**
 * Una inspección no se borra: se da de baja.
 *
 * Estas pruebas cubren las dos mitades del mecanismo, que fallan de formas
 * distintas y silenciosas:
 *
 *  - el **servicio**, que debe marcar en vez de borrar;
 *  - el **gancho del esquema**, que es quien impide que una consulta olvidada
 *    siga mostrando lo dado de baja. Ese olvido no da error: simplemente
 *    reaparece en pantalla algo que se retiró, y nadie lo mira.
 */

// ── El gancho del esquema ────────────────────────────────────────────────

/**
 * Saca el middleware que el esquema registró de verdad para una operación.
 *
 * Se lee del registro real y no de una copia porque lo que hay que comprobar
 * es que **está puesto**: una prueba sobre una función suelta seguiría en
 * verde aunque alguien quitara el `pre` del esquema.
 */
const middlewaresDe = (operacion: string): Array<(this: unknown) => void> => {
  const hooks = (
    InspectionHerraEquiposSchema as unknown as {
      s: {
        hooks: { _pres: Map<string, Array<{ fn: (this: unknown) => void }>> };
      };
    }
  ).s.hooks._pres;

  const registrados = hooks.get(operacion);
  if (!registrados?.length) {
    throw new Error(`El esquema no registró ningún «pre» para «${operacion}»`);
  }
  return registrados.map((r) => r.fn);
};

/**
 * Ejecuta los middlewares de la operación sobre un contexto y devuelve el
 * contexto.
 *
 * Se ejecutan **todos** y no solo el primero porque Mongoose registra los
 * suyos —`timestamps`, entre otros— junto a los del proyecto, y el orden no
 * está bajo nuestro control. Los ajenos fallan al recibir un contexto de
 * mentira, así que se ignora lo que lancen: lo que se comprueba es que alguno
 * de los registrados deja puesto el filtro.
 */
const ejecutarMiddlewares = <T>(operacion: string, contexto: T): T => {
  for (const fn of middlewaresDe(operacion)) {
    try {
      fn.call(contexto);
    } catch {
      // Middleware de Mongoose, no del proyecto: no aplica a este contexto.
    }
  }
  return contexto;
};

/** Consulta de mentira: recuerda el filtro y lo que el gancho le añade. */
const consultaFalsa = (filtroInicial: Record<string, unknown>) => {
  const anadido: Record<string, unknown>[] = [];
  return {
    anadido,
    getFilter: () => filtroInicial,
    where: (cond: Record<string, unknown>) => anadido.push(cond),
  };
};

describe('Baja lógica · gancho del esquema', () => {
  const OPERACIONES = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'countDocuments',
    'updateOne',
    'updateMany',
    'distinct',
  ];

  it.each(OPERACIONES)('«%s» excluye las dadas de baja', (operacion) => {
    const consulta = ejecutarMiddlewares(
      operacion,
      consultaFalsa({ templateCode: 'X' }),
    );

    expect(consulta.anadido).toEqual([{ activo: { $ne: false } }]);
  });

  it('usa $ne y no `activo: true`, para no ocultar los documentos históricos', () => {
    // Los documentos anteriores al campo no lo tienen. `activo: true` los
    // dejaría fuera a todos y vaciaría las pantallas; `$ne: false` los ve.
    const consulta = ejecutarMiddlewares('find', consultaFalsa({}));

    expect(consulta.anadido[0]).toEqual({ activo: { $ne: false } });
    expect(consulta.anadido[0]).not.toEqual({ activo: true });
  });

  it('no se entromete si la consulta ya se pronunció sobre `activo`', () => {
    // Es la escotilla: sin ella no habría forma de encontrar lo dado de baja
    // para restaurarlo.
    const consulta = ejecutarMiddlewares(
      'find',
      consultaFalsa({ activo: false }),
    );

    expect(consulta.anadido).toEqual([]);
  });

  it('las agregaciones también quedan filtradas', () => {
    const tuberia: Record<string, unknown>[] = [{ $group: { _id: '$estado' } }];
    ejecutarMiddlewares('aggregate', { pipeline: () => tuberia });

    expect(tuberia[0]).toEqual({ $match: { activo: { $ne: false } } });
  });

  it('el campo `activo` nace en true', () => {
    expect(InspectionHerraEquiposSchema.path('activo')).toBeDefined();
    expect(
      (
        InspectionHerraEquiposSchema.path('activo') as unknown as {
          options: { default?: boolean };
        }
      ).options.default,
    ).toBe(true);
  });
});

// ── El servicio ──────────────────────────────────────────────────────────

describe('Baja lógica · servicio', () => {
  let servicio: InspectionsHerraEquiposService;
  let modelo: {
    findByIdAndUpdate: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
    deleteOne: jest.Mock;
  };

  const documento = { _id: 'insp-1', templateCode: 'X', activo: false };

  beforeEach(async () => {
    modelo = {
      findByIdAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(documento),
      })),
      findOneAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({ ...documento, activo: true }),
      })),
      findByIdAndDelete: jest.fn(),
      deleteOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        {
          provide: getModelToken(InspectionHerraEquipos.name),
          useValue: modelo,
        },
        {
          provide: EquipmentTrackingService,
          useValue: { registerInspectionWithAutoTracking: jest.fn() },
        },
        { provide: TemplateConfigService, useValue: {} },
        {
          provide: TemplateHerraEquiposService,
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    servicio = module.get(InspectionsHerraEquiposService);
  });

  it('marca la inspección en vez de borrarla', async () => {
    await servicio.remove('insp-1', 'eliodoro');

    expect(modelo.findByIdAndDelete).not.toHaveBeenCalled();
    expect(modelo.deleteOne).not.toHaveBeenCalled();

    const [id, cambios] = modelo.findByIdAndUpdate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('insp-1');
    expect(cambios.activo).toBe(false);
    expect(cambios.eliminadaPor).toBe('eliodoro');
    expect(cambios.eliminadaEn).toBeInstanceOf(Date);
  });

  it('devuelve el documento, que es lo que la bitácora archiva', async () => {
    const resultado = await servicio.remove('insp-1', 'eliodoro');

    // Si esto dejara de devolver `data`, la auditoría volvería a guardar solo
    // quién y cuándo — que es justo el agujero que esto vino a tapar.
    expect(resultado.data).toBe(documento);
  });

  it('da 404 cuando no existe o ya estaba de baja', async () => {
    modelo.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(servicio.remove('fantasma')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restaurar busca nombrando `activo`, o el gancho lo escondería', async () => {
    await servicio.restaurar('insp-1');

    const [filtro] = modelo.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(filtro).toHaveProperty('activo', false);
  });
});
