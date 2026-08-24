import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { EquipmentTrackingController } from './equipment-tracking.controller';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { ES_PUBLICO } from '../../common/nucleo/publico.decorator';

/**
 * El controlador solo traduce parámetros de la URL a llamadas del servicio.
 * Lo que se fija aquí es esa traducción —el orden y el nombre de los
 * argumentos— y que ninguna ruta quede abierta sin autenticación.
 *
 * Un parámetro cambiado de sitio no rompe la compilación cuando ambos son
 * `string`: `check-status` recibiría el código de plantilla como identificador
 * de equipo y respondería con datos de otro equipo.
 */
describe('EquipmentTrackingController', () => {
  let controller: EquipmentTrackingController;
  let servicio: {
    checkEquipmentStatus: jest.Mock;
    resetPreUsoCounter: jest.Mock;
    listarDisponibilidad: jest.Mock;
    getDashboardData: jest.Mock;
    getEquipmentNeedingFrecuente: jest.Mock;
    findAll: jest.Mock;
  };
  const reflector = new Reflector();

  beforeEach(async () => {
    servicio = {
      checkEquipmentStatus: jest.fn().mockResolvedValue({ canProceed: true }),
      resetPreUsoCounter: jest.fn().mockResolvedValue({ ok: true }),
      listarDisponibilidad: jest.fn().mockResolvedValue([]),
      getDashboardData: jest.fn().mockResolvedValue({}),
      getEquipmentNeedingFrecuente: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EquipmentTrackingController],
      providers: [{ provide: EquipmentTrackingService, useValue: servicio }],
    }).compile();

    controller = module.get<EquipmentTrackingController>(
      EquipmentTrackingController,
    );
  });

  describe('check-status', () => {
    it('mapea equipmentId y templateCode a sus campos correctos', async () => {
      await controller.checkEquipmentStatus('TAG-001', '3.04.P37.F24');

      expect(servicio.checkEquipmentStatus).toHaveBeenCalledWith({
        equipmentId: 'TAG-001',
        requestedTemplateCode: '3.04.P37.F24',
      });
    });

    it('devuelve tal cual lo que decide el servicio', async () => {
      servicio.checkEquipmentStatus.mockResolvedValue({
        canProceed: true,
        shouldRedirect: true,
        openForm: '3.04.P37.F25',
      });

      await expect(
        controller.checkEquipmentStatus('TAG-001', '3.04.P37.F24'),
      ).resolves.toMatchObject({ shouldRedirect: true });
    });
  });

  describe('reset-counter', () => {
    it('pasa primero el equipo y despues la plantilla', async () => {
      await controller.resetCounter('TAG-001', '3.04.P37.F24');

      expect(servicio.resetPreUsoCounter).toHaveBeenCalledWith(
        'TAG-001',
        '3.04.P37.F24',
      );
    });
  });

  describe('disponibilidad', () => {
    it('el area es opcional', async () => {
      await controller.listarDisponibilidad('1.02.P06.F33');

      expect(servicio.listarDisponibilidad).toHaveBeenCalledWith(
        '1.02.P06.F33',
        undefined,
      );
    });

    it('cuando llega, el area se reenvia', async () => {
      await controller.listarDisponibilidad('1.02.P06.F33', 'Chancado');

      expect(servicio.listarDisponibilidad).toHaveBeenCalledWith(
        '1.02.P06.F33',
        'Chancado',
      );
    });
  });

  describe('superficie de seguridad', () => {
    it('ninguna ruta esta abierta al publico', () => {
      const rutas = [
        'checkEquipmentStatus',
        'resetCounter',
        'listarDisponibilidad',
        'getDashboard',
        'getPendingFrecuente',
        'findAll',
      ] as const;

      rutas.forEach((ruta) => {
        const metodo = (controller as unknown as Record<string, unknown>)[ruta];
        expect(metodo).toBeDefined();
        expect(reflector.get<boolean>(ES_PUBLICO, metodo as never)).not.toBe(
          true,
        );
      });
    });
  });
});
