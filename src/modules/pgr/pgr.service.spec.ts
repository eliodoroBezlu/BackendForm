import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { PgrService } from './pgr.service';
import { Pgr, PgrEstado, ActividadEstado } from './schemas/pgr.schema';

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
    }
  ]
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
      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a pgr by id', async () => {
      jest.spyOn(model, 'findByIdAndDelete').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockPgr),
      } as any);
      const result = await service.remove('some-id');
      expect(result).toEqual(mockPgr);
    });

    it('should throw an error if not found when trying to remove', async () => {
      jest.spyOn(model, 'findByIdAndDelete').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(null),
      } as any);
      await expect(service.remove('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });
});
