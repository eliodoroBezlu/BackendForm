import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MigracionService } from './migracion.service';
import { Equipo } from './schemas/equipo.schema';
import { UbicacionService } from '../ubicacion/ubicacion.service';
import { ClasificacionService } from '../clasificacion/clasificacion.service';
import { ResolucionOrganizacionalService } from './importacion/resolucion-organizacional.service';

describe('MigracionService', () => {
  let service: MigracionService;

  const mockUbicacionService = {
    findOrCreateByRuta: jest
      .fn()
      .mockResolvedValue({ _id: 'mock-ubicacion-id', nombre: 'Taller' }),
  };

  const mockClasificacionService = {
    findByNameOrCreate: jest.fn().mockResolvedValue({
      _id: 'mock-clasificacion-id',
      nombre: 'Herramientas_eléctricas',
    }),
  };

  const mockResolucion = {
    precargar: jest.fn().mockResolvedValue(undefined),
    resolver: jest.fn().mockReturnValue({ ambito: 'area', area_id: 'a1' }),
  };

  class MockEquipoModel {
    constructor(data: any) {
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
        { provide: getModelToken(Equipo.name), useValue: MockEquipoModel },
        { provide: UbicacionService, useValue: mockUbicacionService },
        { provide: ClasificacionService, useValue: mockClasificacionService },
        {
          provide: ResolucionOrganizacionalService,
          useValue: mockResolucion,
        },
      ],
    }).compile();

    service = module.get<MigracionService>(MigracionService);
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
      const cell = {
        value: { text: 'PL-713', hyperlink: 'http://example.com' },
      } as any;
      expect(service['getCellStringValue'](cell)).toBe('PL-713');
    });

    it('should extract text from rich text cells', () => {
      const cell = {
        value: {
          richText: [{ text: 'Rich ' }, { text: 'Text', font: { bold: true } }],
        },
      } as any;
      expect(service['getCellStringValue'](cell)).toBe('Rich Text');
    });

    it('should handle array value containing objects/text', () => {
      const cell = {
        value: [{ text: 'A' }, 'B', null, 12],
      } as any;
      expect(service['getCellStringValue'](cell)).toBe('AB12');
    });

    it('should return empty string for raw objects', () => {
      const cell = { value: { customObj: true } } as any;
      expect(service['getCellStringValue'](cell)).toBe('');
    });
  });

  describe('valor', () => {
    const cabeceras = (mapa: Record<string, number>) => ({
      mapa,
      original: {},
    });

    it('devuelve el valor de la columna encontrada', () => {
      const row = {
        getCell: jest.fn().mockReturnValue({ value: 'Test Value' }),
      } as any;

      expect(service['valor'](row, cabeceras({ test: 3 }), ['test'])).toBe(
        'Test Value',
      );
      expect(row.getCell).toHaveBeenCalledWith(3);
    });

    it('prueba las claves siguientes cuando la primera no está', () => {
      const row = {
        getCell: jest.fn().mockReturnValue({ value: 'Alternative Value' }),
      } as any;

      expect(
        service['valor'](row, cabeceras({ alternative: 4 }), [
          'missing',
          'alternative',
        ]),
      ).toBe('Alternative Value');
      expect(row.getCell).toHaveBeenCalledWith(4);
    });

    it('devuelve undefined si ninguna clave está en las cabeceras', () => {
      const row = { getCell: jest.fn() } as any;

      expect(
        service['valor'](row, cabeceras({ alternative: 4 }), [
          'missing1',
          'missing2',
        ]),
      ).toBeUndefined();
      expect(row.getCell).not.toHaveBeenCalled();
    });

    it('sigue buscando cuando la columna existe pero está vacía', () => {
      const row = {
        getCell: jest
          .fn()
          .mockReturnValueOnce({ value: '' })
          .mockReturnValueOnce({ value: 'Segunda' }),
      } as any;

      expect(service['valor'](row, cabeceras({ a: 1, b: 2 }), ['a', 'b'])).toBe(
        'Segunda',
      );
    });
  });

  describe('esCodigoInvalido', () => {
    it.each(['', 'SinItem-01', '-SinArea-0000', '#VALUE!', 'PL-#NAME?'])(
      'descarta "%s"',
      (codigo) => {
        expect(service['esCodigoInvalido'](codigo)).toBe(true);
      },
    );

    it('acepta un código real', () => {
      expect(service['esCodigoInvalido']('519-A-0001')).toBe(false);
    });
  });
});
