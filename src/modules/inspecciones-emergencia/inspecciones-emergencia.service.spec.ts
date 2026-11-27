import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { ExtintorService } from '../extintor/extintor.service';
import { Area } from '../area/schemas/area.schema';
import { InspeccionMensualDto } from './dto/create-inspecciones-emergencia.dto';

describe('InspeccionesEmergenciaService', () => {
  let service: InspeccionesEmergenciaService;
  let model: any;

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
    static findById = jest.fn();
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

    service = module.get<InspeccionesEmergenciaService>(
      InspeccionesEmergenciaService,
    );
    model = module.get(getModelToken(FormularioInspeccionEmergencia.name));
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
      expect(spyUpdateMany).toHaveBeenNthCalledWith(
        1,
        { año: { $lt: 2026 }, estado: 'activo' },
        { $set: { estado: 'completado' } },
      );
      expect(spyUpdateMany).toHaveBeenNthCalledWith(
        2,
        { año: 2026, periodo: 'ENERO-JUNIO', estado: 'activo' },
        { $set: { estado: 'completado' } },
      );

      jest.useRealTimers();
    });

    it('should NOT complete ENERO-JUNIO forms if current date is June or earlier', async () => {
      const mockDate = new Date(2026, 5, 10); // June 10th, 2026 (Month index 5)
      jest.useFakeTimers().setSystemTime(mockDate);

      const spyUpdateMany = jest.spyOn(model, 'updateMany');

      await service.autoCompletarFormulariosVencidos();

      // Solo debería correr el primer updateMany para años anteriores
      expect(spyUpdateMany).toHaveBeenCalledTimes(1);
      expect(spyUpdateMany).toHaveBeenCalledWith(
        { año: { $lt: 2026 }, estado: 'activo' },
        { $set: { estado: 'completado' } },
      );

      jest.useRealTimers();
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if tag is missing', async () => {
      const payload: any = { area: 'Recursos Hidricos' };
      await expect(service.create(payload)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return existing form if it already exists (prevents duplicate insertion)', async () => {
      const payload: any = {
        tag: 'TAG-TEST-01',
        periodo: 'ENERO-JUNIO',
        año: 2026,
        area: 'Recursos Hidricos',
      };

      jest.spyOn(model, 'findOne').mockResolvedValue(mockFormInfo);

      const result = await service.create(payload);

      expect(model.findOne).toHaveBeenCalledWith({
        tag: 'TAG-TEST-01',
        periodo: 'ENERO-JUNIO',
        año: 2026,
        estado: { $ne: 'archivado' },
      });
      expect(result).toEqual(mockFormInfo);
    });

    // Lo que pasó en agosto de 2026: la pantalla mandó «crear» con el formulario ya existente
    // (julio) más agosto. Antes se insertaba una copia; después, el mes se descartaba.
    it('si el formulario ya existe, le agrega los meses nuevos en vez de crear otro o ignorarlos', async () => {
      const existente = {
        _id: 'orig-1',
        tag: '710BL728',
        periodo: 'JULIO-DICIEMBRE',
        año: 2026,
        estado: 'activo',
        meses: new Map([['JULIO', { inspector: { nombre: 'A' } }]]),
      };
      const agosto = {
        inspeccionesExtintor: [{ codigo: 'PL-1', ubicacion: 'Taller' }],
        inspector: { nombre: 'B' },
      };
      const payload: any = {
        tag: '710BL728',
        periodo: 'JULIO-DICIEMBRE',
        año: 2026,
        area: 'Filtros',
        mesActual: 'JULIO',
        meses: { JULIO: { inspector: { nombre: 'otro' } }, AGOSTO: agosto },
      };
      jest.spyOn(model, 'findOne').mockResolvedValue(existente);
      const actualizado = { ...existente, mesActual: 'AGOSTO' };
      model.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(actualizado),
      });

      const result = await service.create(payload);

      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'orig-1' },
        {
          $set: {
            'meses.AGOSTO': agosto,
            mesActual: 'AGOSTO',
            fechaUltimaModificacion: expect.any(Date),
          },
        },
      );
      // Julio ya estaba firmado: no se pisa.
      const $set = model.updateOne.mock.calls[0][1].$set;
      expect($set['meses.JULIO']).toBeUndefined();
      expect(
        mockExtintorService.marcarExtintoresComoInspeccionados,
      ).toHaveBeenCalledWith(['PL-1']);
      expect(result).toBe(actualizado);
    });

    it('no agrega meses a un formulario completado', async () => {
      jest.spyOn(model, 'findOne').mockResolvedValue({
        _id: 'orig-2',
        tag: 'T',
        periodo: 'JULIO-DICIEMBRE',
        año: 2025,
        estado: 'completado',
        meses: new Map([['JULIO', {}]]),
      });
      const payload: any = {
        tag: 'T',
        periodo: 'JULIO-DICIEMBRE',
        año: 2025,
        area: 'X',
        mesActual: 'AGOSTO',
        meses: { AGOSTO: {} },
      };
      await expect(service.create(payload)).rejects.toThrow(ForbiddenException);
      expect(model.updateOne).not.toHaveBeenCalled();
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
        estado: 'completado',
      });

      const result = await service.verificarTag(tag, period, year, area);

      expect(model.findOne).toHaveBeenCalledWith({
        tag,
        periodo: period,
        año: year,
        estado: { $ne: 'archivado' },
      });
      expect(result.existe).toBe(true);
      expect(result.esActivo).toBe(false);
      expect(result.puedeModificar).toBe(false);
    });
  });

  describe('actualizarMesPorTag', () => {
    it('should throw ForbiddenException if form is not active (e.g., completed/expired)', async () => {
      const tag = 'TAG-TEST-01';
      const mes = 'JUNIO';
      // Fixture deliberadamente parcial: la prueba comprueba que el metodo
      // rechaza antes de llegar a leer estos datos.
      const datosMes = {
        sistemasPasivos: {},
      } as unknown as InspeccionMensualDto;
      const area = 'Recursos Hidricos';

      // Mock validarEstadoActivo finding a completed form
      jest.spyOn(model, 'findOne').mockResolvedValue({
        ...mockFormInfo,
        estado: 'completado',
      });

      await expect(
        service.actualizarMesPorTag(tag, mes, datosMes, area),
      ).rejects.toThrow(ForbiddenException);
    });

    it('busca el formulario del semestre del mes y escribe en ese documento', async () => {
      jest.spyOn(model, 'findOne').mockResolvedValue({
        _id: 'orig-3',
        tag: '710BL728',
        periodo: 'JULIO-DICIEMBRE',
        estado: 'activo',
      });
      const datosMes = { inspector: { nombre: 'B' } } as InspeccionMensualDto;

      await service.actualizarMesPorTag('710BL728', 'AGOSTO', datosMes, 'F');

      expect(model.findOne).toHaveBeenCalledWith({
        tag: '710BL728',
        periodo: 'JULIO-DICIEMBRE',
        estado: 'activo',
      });
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'orig-3' },
        expect.objectContaining({
          $set: expect.objectContaining({ 'meses.AGOSTO': datosMes }),
        }),
      );
    });
  });
});
