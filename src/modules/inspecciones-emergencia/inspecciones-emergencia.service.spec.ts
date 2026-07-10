import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { ExtintorService } from '../extintor/extintor.service';
import { Area } from '../area/schema/area.schema';

describe('InspeccionesEmergenciaService', () => {
  let service: InspeccionesEmergenciaService;
  let model: any;
  let extintorService: any;
  let areaModel: any;

  const mockFormInfo = {
    _id: 'mock-id',
    tag: 'TAG-TEST-01',
    periodo: 'ENERO-JUNIO',
    año: 2026,
    mesActual: 'MAYO',
    estado: 'activo',
    meses: new Map(),
    save: jest.fn(),
  };

  const mockAreaInfo = {
    nombre: 'Area Test',
    superintendencia: {
      nombre: 'Super Test',
    },
  };

  const mockExtintorService = {
    verificarYCrearExtintores: jest.fn().mockResolvedValue(null),
    marcarExtintoresComoInspeccionados: jest.fn().mockResolvedValue(null),
    findByTag: jest.fn().mockResolvedValue([]),
  };

  // Mock Model Class
  class MockFormularioModel {
    constructor(private data: any) {
      Object.assign(this, data);
    }
    save = jest.fn().mockResolvedValue(this);
    static findOne = jest.fn();
    static updateMany = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    static updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    static find = jest.fn();
  }

  const mockAreaModel = {
    findOne: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(mockAreaInfo),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspeccionesEmergenciaService,
        {
          provide: getModelToken(FormularioInspeccionEmergencia.name),
          useValue: MockFormularioModel,
        },
        {
          provide: ExtintorService,
          useValue: mockExtintorService,
        },
        {
          provide: getModelToken(Area.name),
          useValue: mockAreaModel,
        },
      ],
    }).compile();

    service = module.get<InspeccionesEmergenciaService>(InspeccionesEmergenciaService);
    model = module.get(getModelToken(FormularioInspeccionEmergencia.name));
    extintorService = module.get<ExtintorService>(ExtintorService);
    areaModel = module.get(getModelToken(Area.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoCompletarFormulariosVencidos', () => {
    it('should complete expired active forms from past years', async () => {
      // Mock system Date to be 2026-07-03
      const mockDate = new Date(2026, 6, 3); // July 3rd, 2026
      jest.useFakeTimers().setSystemTime(mockDate);

      const spyUpdateMany = jest.spyOn(model, 'updateMany');

      await service.autoCompletarFormulariosVencidos();

      // Debería correr dos updateMany: uno para años anteriores (año < 2026)
      // y otro para el semestre pasado (año = 2026, periodo = 'ENERO-JUNIO') porque estamos en Julio (index 6)
      expect(spyUpdateMany).toHaveBeenCalledTimes(2);
      expect(spyUpdateMany).toHaveBeenNthCalledWith(1, { año: { $lt: 2026 }, estado: 'activo' }, { $set: { estado: 'completado' } });
      expect(spyUpdateMany).toHaveBeenNthCalledWith(2, { año: 2026, periodo: 'ENERO-JUNIO', estado: 'activo' }, { $set: { estado: 'completado' } });

      jest.useRealTimers();
    });

    it('should NOT complete ENERO-JUNIO forms if current date is June or earlier', async () => {
      const mockDate = new Date(2026, 5, 10); // June 10th, 2026 (Month index 5)
      jest.useFakeTimers().setSystemTime(mockDate);

      const spyUpdateMany = jest.spyOn(model, 'updateMany');

      await service.autoCompletarFormulariosVencidos();

      // Solo debería correr el primer updateMany para años anteriores
      expect(spyUpdateMany).toHaveBeenCalledTimes(1);
      expect(spyUpdateMany).toHaveBeenCalledWith({ año: { $lt: 2026 }, estado: 'activo' }, { $set: { estado: 'completado' } });

      jest.useRealTimers();
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if tag is missing', async () => {
      const payload: any = { area: 'Recursos Hidricos' };
      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
    });

    it('should return existing form if it already exists (prevents duplicate insertion)', async () => {
      const payload: any = { tag: 'TAG-TEST-01', periodo: 'ENERO-JUNIO', año: 2026, area: 'Recursos Hidricos' };
      
      jest.spyOn(model, 'findOne').mockResolvedValue(mockFormInfo);

      const result = await service.create(payload);

      expect(model.findOne).toHaveBeenCalledWith({
        tag: 'TAG-TEST-01',
        periodo: 'ENERO-JUNIO',
        año: 2026
      });
      expect(result).toEqual(mockFormInfo);
    });
  });

  describe('verificarTag', () => {
    it('should verify tag by period and year regardless of status', async () => {
      const tag = 'TAG-TEST-01';
      const period = 'ENERO-JUNIO';
      const year = 2026;
      const area = 'Recursos Hidricos';

      jest.spyOn(model, 'findOne').mockResolvedValue({
        ...mockFormInfo,
        estado: 'completado'
      });

      const result = await service.verificarTag(tag, period, year, area);

      expect(model.findOne).toHaveBeenCalledWith({ tag, periodo: period, año: year });
      expect(result.existe).toBe(true);
      expect(result.esActivo).toBe(false);
      expect(result.puedeModificar).toBe(false);
    });
  });

  describe('actualizarMesPorTag', () => {
    it('should throw ForbiddenException if form is not active (e.g., completed/expired)', async () => {
      const tag = 'TAG-TEST-01';
      const mes = 'JUNIO';
      const datosMes = { sistemasPasivos: {} };
      const area = 'Recursos Hidricos';

      // Mock validarEstadoActivo finding a completed form
      jest.spyOn(model, 'findOne').mockResolvedValue({
        ...mockFormInfo,
        estado: 'completado'
      });

      await expect(service.actualizarMesPorTag(tag, mes, datosMes, area)).rejects.toThrow(ForbiddenException);
    });
  });
});
