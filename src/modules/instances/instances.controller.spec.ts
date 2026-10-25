import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA } from '@nestjs/common/constants';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { InstancesDocumentService } from './instances-document.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

/**
 * `findAll` arma el filtro campo a campo, y lo interesante es **lo que NO
 * incluye**: un filtro ausente no debe aparecer en el objeto, porque
 * `{ status: undefined }` y no tener `status` no siempre significan lo mismo
 * al llegar a Mongo.
 *
 * También se comprueba el orden de rutas: `compliance-report` estaba declarado
 * **después** de `:id` y era inalcanzable.
 */
describe('InstancesController', () => {
  let controller: InstancesController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      getStats: jest.fn().mockResolvedValue({}),
      getComplianceReport: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstancesController],
      providers: [
        { provide: InstancesService, useValue: servicio },
        { provide: InstancesDocumentService, useValue: { generar: jest.fn() } },
        { provide: BulkDownloadService, useValue: { descargar: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InstancesController>(InstancesController);
  });

  const filtros = () =>
    servicio.findAll.mock.calls[0][0] as Record<string, unknown>;

  describe('autor de la IRO', () => {
    it('al crear, el autor es el usuario de la sesion, no lo que diga el cuerpo', async () => {
      await controller.create({ createdBy: 'otro' } as never, 'jperez');

      expect(servicio.create.mock.calls[0][0]).toMatchObject({
        createdBy: 'jperez',
      });
    });

    it('al editar, queda quien edito y el autor no cambia', async () => {
      await controller.update('id-1', { createdBy: 'otro' } as never, 'jperez');

      const enviado = servicio.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(enviado.updatedBy).toBe('jperez');
      expect(enviado).not.toHaveProperty('createdBy');
    });
  });

  describe('construcción del filtro', () => {
    it('la paginacion siempre viaja en el filtro', async () => {
      // Los valores por defecto (pagina 1, 10 por pagina) los aplica
      // `DefaultValuePipe` en la capa HTTP, no este metodo; aqui lo que se
      // comprueba es que ambos campos se reenvian siempre.
      await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        100,
        2,
        25,
      );

      expect(filtros().page).toBe(2);
      expect(filtros().limit).toBe(25);
    });

    it('el codigo de plantilla viaja como templateCode', async () => {
      await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        100,
        1,
        10,
        '1.02.P06.F12',
      );

      expect(filtros().templateCode).toBe('1.02.P06.F12');
    });

    it('los filtros ausentes NO se incluyen en el objeto', async () => {
      await controller.findAll();

      expect('templateId' in filtros()).toBe(false);
      expect('status' in filtros()).toBe(false);
      expect('area' in filtros()).toBe(false);
    });

    it('los presentes si se incluyen', async () => {
      await controller.findAll('tpl-1', 'completado', 'jperez');

      expect(filtros()).toMatchObject({
        templateId: 'tpl-1',
        status: 'completado',
        createdBy: 'jperez',
      });
    });

    it('las fechas se convierten a Date', async () => {
      await controller.findAll(
        undefined,
        undefined,
        undefined,
        '2026-01-01',
        '2026-01-31',
      );

      expect(filtros().dateFrom).toBeInstanceOf(Date);
      expect(filtros().dateTo).toBeInstanceOf(Date);
    });
  });

  describe('orden de rutas', () => {
    it('«compliance-report» y «stats» se declaran antes que «:id»', () => {
      const rutas = Object.getOwnPropertyNames(InstancesController.prototype)
        .filter((n) => n !== 'constructor')
        .map(
          (n) =>
            Reflect.getMetadata(
              PATH_METADATA,
              (
                InstancesController.prototype as unknown as Record<
                  string,
                  unknown
                >
              )[n] as object,
            ) as string,
        )
        .filter((r) => typeof r === 'string');

      const posicionId = rutas.indexOf(':id');
      expect(rutas.indexOf('compliance-report')).toBeLessThan(posicionId);
      expect(rutas.indexOf('stats')).toBeLessThan(posicionId);
    });
  });
});
