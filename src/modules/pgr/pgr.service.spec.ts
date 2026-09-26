import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { PgrService } from './pgr.service';
import { Pgr, PgrEstado, ActividadEstado } from './schemas/pgr.schema';
import { Area } from '../area/schemas/area.schema';
import { Superintendencia } from '../superintendencia/schemas/superintendencia.schema';

const mockPgr = {
  _id: 'some-id',
  codigoAutogenerado: 'PLAN-2026-0001',
  empresa: 'Empresa',
  gerencia: 'Gerencia',
  vicepresidencia: 'VP',
  superintendencia: 'Sup',
  gestion: '2026',
  estado: PgrEstado.BORRADOR,
  actividades: [
    {
      _id: 'act1',
      descripcion: 'Act 1',
      estadoAprobacion: ActividadEstado.PENDIENTE,
    },
  ],
};

const mockPgrModel = {
  new: jest.fn().mockResolvedValue(mockPgr),
  constructor: jest.fn().mockResolvedValue(mockPgr),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  exec: jest.fn(),
  sort: jest.fn(),
  save: jest.fn(),
};

describe('PgrService', () => {
  let service: PgrService;
  let model: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PgrService,
        {
          provide: getModelToken(Pgr.name),
          useValue: mockPgrModel,
        },
        {
          provide: getModelToken(Area.name),
          useValue: {},
        },
        {
          provide: getModelToken(Superintendencia.name),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PgrService>(PgrService);
    model = module.get(getModelToken(Pgr.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all pgr files', async () => {
      jest.spyOn(model, 'find').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce([mockPgr]),
      } as any);
      const pgrs = await service.findAll();
      expect(pgrs).toEqual([mockPgr]);
    });
  });

  describe('findOne', () => {
    it('should find one pgr by id', async () => {
      jest.spyOn(model, 'findById').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockPgr),
      } as any);
      const pgr = await service.findOne('some-id');
      expect(pgr).toEqual(mockPgr);
    });

    it('should throw an error if pgr is not found', async () => {
      jest.spyOn(model, 'findById').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(null),
      } as any);
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * El formulario de configuración manda el array completo de actividades,
   * pero solo conoce los campos que edita. Antes el update lo reemplazaba tal
   * cual y se llevaba puesto todo lo demás.
   */
  describe('update — fusión de actividades', () => {
    /** Actividad consolidada desde una matriz, ya con aprobación y seguimiento. */
    const consolidada = {
      _id: 'act1',
      descripcion: 'Seguimiento al programa de inspecciones ISOP',
      verificador: 'Seguimiento al programa de inspecciones ISOP',
      responsable: '',
      recurso: '',
      entregable: '',
      programacion: [{ mes: 1, programado: 2 }],
      estadoAprobacion: ActividadEstado.APROBADO,
      motivoRechazo: undefined,
      fechaEjecucion: new Date('2026-03-10'),
      observaciones: 'Ejecutado en obra',
      evidencias: ['https://archivo/1.pdf'],
      semaforoTiempo: 'En el Mes',
      origenMatriz: {
        clave: 'isop||seguimiento',
        nivelRiesgoMaximo: 'INACEPTABLE',
        generadoEn: new Date('2026-01-05'),
        riesgosCubiertos: [
          { areaCodigo: '3310', areaNombre: 'Chancado', riesgoNumero: 7 },
        ],
      },
    };

    const conActividadesGuardadas = () => {
      jest.spyOn(model, 'findById').mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockPgr,
          actividades: [consolidada],
        }),
      } as any);
      jest.spyOn(model, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPgr),
      } as any);
    };

    /** Lo que el servicio terminó mandando a Mongo. */
    const actividadesGuardadas = () =>
      (model.findByIdAndUpdate.mock.calls[0][1] as { actividades: any[] })
        .actividades;

    it('conserva origenMatriz, aprobación y seguimiento al editar', async () => {
      conActividadesGuardadas();

      await service.update('some-id', {
        actividades: [
          {
            _id: 'act1',
            descripcion: consolidada.descripcion,
            verificador: consolidada.verificador,
            // Lo que el usuario vino a completar: la matriz no los aporta.
            responsable: 'J. Pérez',
            recurso: 'Horas hombre',
            entregable: 'Reporte mensual',
            programacion: [{ mes: 1, programado: 3 }],
          },
        ],
      } as any);

      const [guardada] = actividadesGuardadas();
      expect(guardada._id).toBe('act1');
      expect(guardada.origenMatriz).toEqual(consolidada.origenMatriz);
      expect(guardada.estadoAprobacion).toBe(ActividadEstado.APROBADO);
      expect(guardada.fechaEjecucion).toEqual(consolidada.fechaEjecucion);
      expect(guardada.observaciones).toBe('Ejecutado en obra');
      expect(guardada.evidencias).toEqual(['https://archivo/1.pdf']);
      expect(guardada.semaforoTiempo).toBe('En el Mes');
    });

    it('sí aplica los campos que el formulario edita', async () => {
      conActividadesGuardadas();

      await service.update('some-id', {
        actividades: [
          {
            _id: 'act1',
            descripcion: 'Descripción corregida',
            verificador: consolidada.verificador,
            responsable: 'J. Pérez',
            recurso: 'Horas hombre',
            entregable: 'Reporte mensual',
            programacion: [{ mes: 1, programado: 3 }],
          },
        ],
      } as any);

      const [guardada] = actividadesGuardadas();
      expect(guardada.descripcion).toBe('Descripción corregida');
      expect(guardada.responsable).toBe('J. Pérez');
      expect(guardada.recurso).toBe('Horas hombre');
      expect(guardada.entregable).toBe('Reporte mensual');
      expect(guardada.programacion).toEqual([{ mes: 1, programado: 3 }]);
    });

    it('da de alta las actividades sin _id y las deja sin ese campo', async () => {
      conActividadesGuardadas();

      await service.update('some-id', {
        actividades: [
          {
            descripcion: 'Actividad nueva a mano',
            verificador: 'Verificador nuevo',
            responsable: 'M. Gómez',
            recurso: 'Presupuesto',
            entregable: 'Acta',
          },
        ],
      } as any);

      const [guardada] = actividadesGuardadas();
      expect(guardada._id).toBeUndefined();
      expect(guardada.origenMatriz).toBeUndefined();
      expect(guardada.descripcion).toBe('Actividad nueva a mano');
    });

    it('da de baja las que ya no vienen', async () => {
      conActividadesGuardadas();

      await service.update('some-id', { actividades: [] } as any);

      expect(actividadesGuardadas()).toEqual([]);
    });

    it('no toca las actividades si el payload no las trae', async () => {
      jest.spyOn(model, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPgr),
      } as any);

      await service.update('some-id', { gestion: '2027' } as any);

      const payload = model.findByIdAndUpdate.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(payload).not.toHaveProperty('actividades');
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('da de baja el pgr en vez de borrarlo, con quien y cuando', async () => {
      const findByIdAndUpdate = jest
        .spyOn(model, 'findByIdAndUpdate')
        .mockReturnValue({
          exec: jest.fn().mockResolvedValueOnce(mockPgr),
        } as any);

      const result = await service.remove('some-id', 'jperez');

      expect(result).toEqual(mockPgr);
      const cambios = findByIdAndUpdate.mock.calls[0][1] as unknown as {
        activo: boolean;
        eliminadaPor: string;
      };
      expect(cambios.activo).toBe(false);
      expect(cambios.eliminadaPor).toBe('jperez');
    });

    it('should throw an error if not found when trying to remove', async () => {
      jest.spyOn(model, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(null),
      } as any);
      await expect(service.remove('invalid-id', 'jperez')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
