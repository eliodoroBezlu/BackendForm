import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquipos } from './schemas/inspection-herra-equipos.schema';
import { InspectionStatus } from './types/IProps';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';

/**
 * El flujo de aprobación es donde una inspección deja de ser un borrador y
 * pasa a contar: al aprobarla se dispara el seguimiento de frecuencia, que es
 * lo que decide cuándo toca la siguiente revisión de ese equipo.
 *
 * Aquí se fija que ese disparo ocurre **solo al aprobar**, y que no se puede
 * aprobar dos veces ni aprobar algo que nunca se envió.
 */
const inspeccion = (estado: InspectionStatus) => {
  const doc = {
    _id: 'id-inspeccion',
    status: estado,
    templateCode: '3.04.P37.F24',
    verification: { TAG: 'TAG-001' },
    submittedBy: 'jperez',
    approval: undefined as unknown,
    save: jest.fn(),
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('InspectionsHerraEquiposService · aprobación', () => {
  let servicio: InspectionsHerraEquiposService;
  let seguimiento: { registerInspectionWithAutoTracking: jest.Mock };

  const construir = async (doc: unknown) => {
    seguimiento = {
      registerInspectionWithAutoTracking: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        {
          provide: getModelToken(InspectionHerraEquipos.name),
          useValue: {
            findById: jest.fn(() => ({
              exec: jest.fn().mockResolvedValue(doc),
            })),
            find: jest.fn(() => ({
              sort: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        { provide: EquipmentTrackingService, useValue: seguimiento },
        TemplateConfigService,
        {
          provide: TemplateHerraEquiposService,
          useValue: { findByCode: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    servicio = module.get<InspectionsHerraEquiposService>(
      InspectionsHerraEquiposService,
    );
  };

  describe('approveInspection', () => {
    it('una inspeccion inexistente da 404', async () => {
      await construir(null);

      await expect(
        servicio.approveInspection('no-existe', {
          approvedBy: 'sup',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo se aprueba lo que esta pendiente de aprobacion', async () => {
      await construir(inspeccion(InspectionStatus.DRAFT));

      await expect(
        servicio.approveInspection('id', { approvedBy: 'sup' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no se aprueba dos veces', async () => {
      await construir(inspeccion(InspectionStatus.APPROVED));

      await expect(
        servicio.approveInspection('id', { approvedBy: 'sup' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al aprobar deja constancia de quien y cuando', async () => {
      const doc = inspeccion(InspectionStatus.PENDING_APPROVAL);
      await construir(doc);

      await servicio.approveInspection('id', {
        approvedBy: 'supervisor1',
        supervisorComments: 'Conforme',
      } as never);

      expect(doc.status).toBe(InspectionStatus.APPROVED);
      expect(doc.approval).toMatchObject({
        status: 'approved',
        approvedBy: 'supervisor1',
        supervisorComments: 'Conforme',
      });
      expect((doc.approval as { approvedAt: Date }).approvedAt).toBeInstanceOf(
        Date,
      );
    });

    it('LA CONSECUENCIA: aprobar dispara el seguimiento de frecuencia', async () => {
      // Es lo que hace avanzar el contador de pre-usos del equipo. Si no se
      // dispara, el equipo nunca llega a exigir su inspeccion frecuente.
      await construir(inspeccion(InspectionStatus.PENDING_APPROVAL));

      await servicio.approveInspection('id', { approvedBy: 'sup' } as never);

      expect(seguimiento.registerInspectionWithAutoTracking).toHaveBeenCalled();
    });

    it('un fallo del seguimiento NO tumba la aprobacion', async () => {
      // La firma del supervisor ya esta puesta: perder la aprobacion por un
      // fallo del contador seria mucho peor que perder el contador.
      await construir(inspeccion(InspectionStatus.PENDING_APPROVAL));
      seguimiento.registerInspectionWithAutoTracking.mockRejectedValue(
        new Error('mongo caido'),
      );

      await expect(
        servicio.approveInspection('id', { approvedBy: 'sup' } as never),
      ).resolves.toBeDefined();
    });
  });

  describe('rejectInspection', () => {
    it('una inspeccion inexistente da 404', async () => {
      await construir(null);

      await expect(
        servicio.rejectInspection('no-existe', {
          rejectedBy: 'sup',
          rejectionReason: 'x',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo se rechaza lo que esta pendiente', async () => {
      await construir(inspeccion(InspectionStatus.APPROVED));

      await expect(
        servicio.rejectInspection('id', {
          rejectedBy: 'sup',
          rejectionReason: 'x',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al rechazar guarda el motivo', async () => {
      // Sin motivo, el inspector no sabe que corregir.
      const doc = inspeccion(InspectionStatus.PENDING_APPROVAL);
      await construir(doc);

      await servicio.rejectInspection('id', {
        rejectedBy: 'supervisor1',
        rejectionReason: 'Falta la firma del operador',
      } as never);

      expect(doc.status).toBe(InspectionStatus.REJECTED);
      expect(doc.approval).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Falta la firma del operador',
      });
    });

    it('rechazar NO dispara el seguimiento', async () => {
      // Una inspeccion rechazada no cuenta como realizada.
      await construir(inspeccion(InspectionStatus.PENDING_APPROVAL));

      await servicio.rejectInspection('id', {
        rejectedBy: 'sup',
        rejectionReason: 'x',
      } as never);

      expect(
        seguimiento.registerInspectionWithAutoTracking,
      ).not.toHaveBeenCalled();
    });
  });
});
