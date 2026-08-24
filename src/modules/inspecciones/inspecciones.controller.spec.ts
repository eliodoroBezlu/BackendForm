import { Test, TestingModule } from '@nestjs/testing';
import { InspeccionesController } from './inspecciones.controller';
import { InspeccionesService } from './inspecciones.service';
import { ExcelService } from '../excel/excel.service';

/**
 * `findAll` decide entre dos consultas distintas según si llegó algún filtro.
 * Esa bifurcación es lo que se fija aquí: con filtros va a la consulta
 * filtrada; sin ellos, a la simple —que no arrastra un `$match` vacío—.
 */
describe('InspeccionesController · findAll', () => {
  let controller: InspeccionesController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findAllWithFilters: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspeccionesController],
      providers: [
        { provide: InspeccionesService, useValue: servicio },
        { provide: ExcelService, useValue: { generar: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InspeccionesController>(InspeccionesController);
  });

  it('sin ningun filtro usa la consulta simple', async () => {
    await controller.findAll();

    expect(servicio.findAll).toHaveBeenCalled();
    expect(servicio.findAllWithFilters).not.toHaveBeenCalled();
  });

  it('basta UN filtro para usar la consulta filtrada', async () => {
    await controller.findAll(undefined, undefined, 'Mina');

    expect(servicio.findAllWithFilters).toHaveBeenCalled();
    expect(servicio.findAll).not.toHaveBeenCalled();
  });

  it('las fechas llegan como texto y se convierten a Date', async () => {
    await controller.findAll('2026-01-01', '2026-01-31');

    const filtros = servicio.findAllWithFilters.mock.calls[0][0] as {
      startDate: Date;
      endDate: Date;
    };
    expect(filtros.startDate).toBeInstanceOf(Date);
    expect(filtros.endDate).toBeInstanceOf(Date);
  });

  it('una fecha ausente queda undefined, no «Invalid Date»', async () => {
    // `new Date(undefined)` produce una fecha invalida que Mongo rechazaria.
    await controller.findAll(undefined, undefined, 'Mina');

    const filtros = servicio.findAllWithFilters.mock.calls[0][0] as {
      startDate?: Date;
    };
    expect(filtros.startDate).toBeUndefined();
  });

  it('«operativo=NO» activa el filtrado igual que cualquier otro', async () => {
    // Es una cadena no vacia, asi que cuenta como filtro presente.
    await controller.findAll(undefined, undefined, undefined, 'NO');

    expect(servicio.findAllWithFilters).toHaveBeenCalled();
  });
});
