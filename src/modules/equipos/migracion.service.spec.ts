import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MigracionService } from './migracion.service';
import { Equipo } from './schemas/equipo.schema';
import { UbicacionService } from '../ubicacion/ubicacion.service';
import { ClasificacionService } from '../clasificacion/clasificacion.service';

describe('MigracionService', () => {
  let service: MigracionService;
  let equipoModel: any;
  let areaModel: any;
  let superModel: any;
  let ubicacionService: any;
  let clasificacionService: any;

  const mockUbicacionService = {
    findByNameOrCreate: jest.fn().mockResolvedValue({ _id: 'mock-ubicacion-id', nombre: 'Taller' }),
  };

  const mockClasificacionService = {
    findByNameOrCreate: jest.fn().mockResolvedValue({ _id: 'mock-clasificacion-id', nombre: 'Herramientas_eléctricas' }),
  };

  const mockAreaModel = {
    findOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'mock-area-id', nombre: 'CHANCADO' }),
    }),
  };

  const mockSuperModel = {
    findOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'mock-super-id', nombre: 'Superintendencia' }),
    }),
  };

  class MockEquipoModel {
    constructor(private data: any) {
      Object.assign(this, data);
    }
    save = jest.fn().mockResolvedValue(this);
    static findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    static findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigracionService,
        {
          provide: getModelToken(Equipo.name),
          useValue: MockEquipoModel,
        },
        {
          provide: getModelToken('Area'),
          useValue: mockAreaModel,
        },
        {
          provide: getModelToken('Superintendencia'),
          useValue: mockSuperModel,
        },
        {
          provide: UbicacionService,
          useValue: mockUbicacionService,
        },
        {
          provide: ClasificacionService,
          useValue: mockClasificacionService,
        },
      ],
    }).compile();

    service = module.get<MigracionService>(MigracionService);
    equipoModel = module.get(getModelToken(Equipo.name));
    areaModel = module.get(getModelToken('Area'));
    superModel = module.get(getModelToken('Superintendencia'));
    ubicacionService = module.get<UbicacionService>(UbicacionService);
    clasificacionService = module.get<ClasificacionService>(ClasificacionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCellStringValue', () => {
    it('should return empty string for null or undefined cell', () => {
      expect(service['getCellStringValue'](null as any)).toBe('');
      expect(service['getCellStringValue'](undefined as any)).toBe('');
    });

    it('should return primitive string value', () => {
      const cell = { value: '  Hello World  ' } as any;
      expect(service['getCellStringValue'](cell)).toBe('Hello World');
    });

    it('should return string representation of primitive number value', () => {
      const cell = { value: 1234 } as any;
      expect(service['getCellStringValue'](cell)).toBe('1234');
    });

    it('should extract the result of formula cells', () => {
      const cell = { value: { formula: 'SUM(A1:A2)', result: '350' } } as any;
      expect(service['getCellStringValue'](cell)).toBe('350');
    });

    it('should return empty string if formula result is null/undefined', () => {
      const cell = { value: { formula: 'SUM(A1:A2)', result: null } } as any;
      expect(service['getCellStringValue'](cell)).toBe('');
    });

    it('should extract the text of hyperlink cells', () => {
      const cell = { value: { text: 'PL-713', hyperlink: 'http://example.com' } } as any;
      expect(service['getCellStringValue'](cell)).toBe('PL-713');
    });

    it('should extract text from rich text cells', () => {
      const cell = {
        value: {
          richText: [
            { text: 'Rich ' },
            { text: 'Text', font: { bold: true } },
          ],
        },
      } as any;
      expect(service['getCellStringValue'](cell)).toBe('Rich Text');
    });

    it('should handle array value containing objects/text', () => {
      const cell = {
        value: [
          { text: 'A' },
          'B',
          null,
          12,
        ],
      } as any;
      expect(service['getCellStringValue'](cell)).toBe('AB12');
    });

    it('should return empty string for raw objects', () => {
      const cell = { value: { customObj: true } } as any;
      expect(service['getCellStringValue'](cell)).toBe('');
    });
  });

  describe('getCellValue', () => {
    it('should return cell string value if found', () => {
      const row = {
        getCell: jest.fn().mockReturnValue({ value: 'Test Value' }),
      } as any;
      const headerMap = { test: 3 };
      
      const res = service['getCellValue'](row, headerMap, ['test']);
      expect(res).toBe('Test Value');
      expect(row.getCell).toHaveBeenCalledWith(3);
    });

    it('should fallback to subsequent keys if first key is missing in headerMap', () => {
      const row = {
        getCell: jest.fn().mockReturnValue({ value: 'Alternative Value' }),
      } as any;
      const headerMap = { alternative: 4 };
      
      const res = service['getCellValue'](row, headerMap, ['missing', 'alternative']);
      expect(res).toBe('Alternative Value');
      expect(row.getCell).toHaveBeenCalledWith(4);
    });

    it('should return undefined if no matching keys in headerMap', () => {
      const row = {
        getCell: jest.fn(),
      } as any;
      const headerMap = { alternative: 4 };
      
      const res = service['getCellValue'](row, headerMap, ['missing1', 'missing2']);
      expect(res).toBeUndefined();
      expect(row.getCell).not.toHaveBeenCalled();
    });
  });
});
