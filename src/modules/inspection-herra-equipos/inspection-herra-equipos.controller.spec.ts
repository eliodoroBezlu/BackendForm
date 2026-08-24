import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsHerraEquiposController } from './inspection-herra-equipos.controller';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquiposDocumentService } from './inspection-herra-equipos-document.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';

/**
 * Lo delicado de este controlador es la **bandeja de aprobaciones**: las áreas
 * llegan como una lista separada por comas y de ahí sale quién ve qué. Un
 * parseo flojo deja al supervisor viendo inspecciones de otra área — o
 * ninguna.
 */
describe('InspectionsHerraEquiposController · bandeja de aprobación', () => {
  let controller: InspectionsHerraEquiposController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({}),
      approveInspection: jest.fn().mockResolvedValue({}),
      rejectInspection: jest.fn().mockResolvedValue({}),
      findPendingApprovals: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findInProgress: jest.fn().mockResolvedValue([]),
      findDrafts: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({}),
      findByTemplateCode: jest.fn().mockResolvedValue([]),
      findByEquipo: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateInProgress: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspectionsHerraEquiposController],
      providers: [
        { provide: InspectionsHerraEquiposService, useValue: servicio },
        {
          provide: InspectionHerraEquiposDocumentService,
          useValue: { generar: jest.fn() },
        },
        { provide: BulkDownloadService, useValue: { descargar: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InspectionsHerraEquiposController>(
      InspectionsHerraEquiposController,
    );
  });

  const opciones = () =>
    servicio.findPendingApprovals.mock.calls[0][0] as {
      areas: string[];
      excludeSubmittedBy?: string;
    };

  describe('áreas como lista separada por comas', () => {
    it('divide la cadena en areas', async () => {
      await controller.findPendingApprovals(undefined, 'Chancado,Flotacion');

      expect(opciones().areas).toEqual(['Chancado', 'Flotacion']);
    });

    it('recorta los espacios alrededor de cada area', async () => {
      // El frontend une con «, » y sin recortar quedaria « Flotacion», que no
      // coincide con ningun area guardada.
      await controller.findPendingApprovals(undefined, 'Chancado, Flotacion');

      expect(opciones().areas).toEqual(['Chancado', 'Flotacion']);
    });

    it('descarta los huecos de una lista mal formada', async () => {
      await controller.findPendingApprovals(undefined, 'Chancado,,Flotacion,');

      expect(opciones().areas).toEqual(['Chancado', 'Flotacion']);
    });

    it('sin areas pasa una lista vacia, no undefined', async () => {
      // El servicio distingue «sin filtro de area» por la lista vacia.
      await controller.findPendingApprovals();

      expect(opciones().areas).toEqual([]);
    });

    it('una sola area tambien llega como lista', async () => {
      await controller.findPendingApprovals(undefined, 'Chancado');

      expect(opciones().areas).toEqual(['Chancado']);
    });
  });

  describe('quien no puede aprobar lo suyo', () => {
    it('el usuario a excluir se reenvia', async () => {
      // Es lo que impide que un supervisor apruebe su propia inspeccion.
      await controller.findPendingApprovals('jperez', 'Chancado');

      expect(opciones().excludeSubmittedBy).toBe('jperez');
    });
  });

  describe('aprobar y rechazar', () => {
    it('aprobar pasa el id y el cuerpo', async () => {
      await controller.approveInspection('insp-1', {
        approvedBy: 'sup',
      } as never);

      expect(servicio.approveInspection).toHaveBeenCalledWith('insp-1', {
        approvedBy: 'sup',
      });
    });

    it('rechazar usa su propio metodo, no el de aprobar', async () => {
      await controller.rejectInspection('insp-1', {
        rejectedBy: 'sup',
        rejectionReason: 'Falta firma',
      } as never);

      expect(servicio.rejectInspection).toHaveBeenCalled();
      expect(servicio.approveInspection).not.toHaveBeenCalled();
    });
  });
});
