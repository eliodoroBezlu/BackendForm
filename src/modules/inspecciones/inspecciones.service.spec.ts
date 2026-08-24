import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InspeccionesService } from './inspecciones.service';
import { Inspeccion } from './schemas/inspeccion.schema';

/**
 * Lo que aporta este servicio es **la construcción del filtro de búsqueda**.
 * Un filtro mal armado no da error: devuelve el conjunto equivocado, que es
 * mucho más difícil de notar.
 */
const cadena = (resultado: unknown) => {
  const eslabon: Record<string, jest.Mock> = {};
  ['find', 'sort', 'select', 'limit', 'lean'].forEach((m) => {
    eslabon[m] = jest.fn(() => eslabon);
  });
  eslabon.exec = jest.fn().mockResolvedValue(resultado);
  return eslabon;
};

describe('InspeccionesService · filtros de búsqueda', () => {
  let servicio: InspeccionesService;
  let modelo: Record<string, jest.Mock>;

  beforeEach(async () => {
    modelo = cadena([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspeccionesService,
        { provide: getModelToken(Inspeccion.name), useValue: modelo },
      ],
    }).compile();

    servicio = module.get<InspeccionesService>(InspeccionesService);
  });

  const filtroUsado = () =>
    modelo.find.mock.calls[0][0] as Record<string, unknown>;

  it('sin filtros no restringe nada', async () => {
    await servicio.findAllWithFilters({});

    expect(filtroUsado()).toEqual({});
  });

  it('las mas recientes van primero', async () => {
    await servicio.findAllWithFilters({});

    expect(modelo.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  describe('rango de fechas', () => {
    it('exige las DOS fechas para aplicar el rango', async () => {
      // Con una sola, un `$gte` suelto devolveria «desde esa fecha hasta hoy»
      // sin que el usuario lo haya pedido.
      await servicio.findAllWithFilters({ startDate: new Date(2026, 0, 1) });

      expect(filtroUsado().createdAt).toBeUndefined();
    });

    it('con ambas, filtra el intervalo cerrado', async () => {
      const desde = new Date(2026, 0, 1);
      const hasta = new Date(2026, 0, 31);

      await servicio.findAllWithFilters({ startDate: desde, endDate: hasta });

      expect(filtroUsado().createdAt).toEqual({ $gte: desde, $lte: hasta });
    });
  });

  describe('filtros de texto', () => {
    it('la superintendencia busca dentro del subdocumento', async () => {
      await servicio.findAllWithFilters({ superintendencia: 'Mina' });

      expect(
        filtroUsado()['informacionGeneral.superintendencia'],
      ).toMatchObject({ $options: 'i' });
    });

    it('el numero de inspeccion tambien', async () => {
      await servicio.findAllWithFilters({ numInspeccion: 'INS-001' });

      expect(filtroUsado()['informacionGeneral.numInspeccion']).toBeDefined();
    });

    it('el texto se escapa antes de entrar al $regex', async () => {
      // «INS-001» no lleva metacaracteres, pero un numero con parentesis o un
      // punto si: sin escapar, el punto casaria con cualquier caracter.
      await servicio.findAllWithFilters({ numInspeccion: '1.02' });

      const filtro = filtroUsado()['informacionGeneral.numInspeccion'] as {
        $regex: string;
      };
      expect(filtro.$regex).toBe('1\\.02');
    });
  });

  describe('operativo', () => {
    it('«NO» se respeta como filtro', async () => {
      await servicio.findAllWithFilters({ operativo: 'NO' });

      expect(filtroUsado().operativo).toBe('NO');
    });

    it('se pueden combinar varios filtros a la vez', async () => {
      await servicio.findAllWithFilters({
        operativo: 'SI',
        superintendencia: 'Mina',
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 0, 31),
      });

      const filtro = filtroUsado();
      expect(filtro.operativo).toBe('SI');
      expect(filtro['informacionGeneral.superintendencia']).toBeDefined();
      expect(filtro.createdAt).toBeDefined();
    });
  });
});
