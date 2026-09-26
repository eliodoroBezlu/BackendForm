import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquipos } from './schemas/inspection-herra-equipos.schema';
import { InspectionStatus } from './types/IProps';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';

/**
 * Quién puede dejar una inspección aprobada.
 *
 * `PATCH /inspections-herra-equipos/:id` no tenía guarda de rol —el único
 * `@Roles` del controlador estaba en `restaurar`— y su DTO hereda `status` de
 * `PartialType(CreateDto)`. Entre las dos cosas, cualquier usuario autenticado
 * podía dejar una inspección en `approved` sin pasar por la aprobación, es
 * decir sin la firma del supervisor ni sus comentarios.
 *
 * El campo no se puede quitar del DTO: el técnico lo usa para finalizar una
 * inspección en curso, y quitarlo rompería ese flujo. Lo que se acota es a qué
 * estados puede llevar.
 */
describe('InspectionsHerraEquiposService · cambio de estado por PATCH', () => {
  let servicio: InspectionsHerraEquiposService;
  let modelo: Record<string, jest.Mock>;

  const construir = async (estadoActual?: InspectionStatus) => {
    modelo = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn(() => ({
            exec: jest
              .fn()
              .mockResolvedValue(
                estadoActual ? { status: estadoActual } : null,
              ),
          })),
        })),
        exec: jest.fn().mockResolvedValue(null),
      })),
      findByIdAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({ _id: 'id-1' }),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        {
          provide: getModelToken(InspectionHerraEquipos.name),
          useValue: modelo,
        },
        {
          provide: EquipmentTrackingService,
          useValue: { registerInspectionWithAutoTracking: jest.fn() },
        },
        TemplateConfigService,
        {
          provide: TemplateHerraEquiposService,
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    servicio = module.get(InspectionsHerraEquiposService);
  };

  it('deja finalizar una inspección en curso', async () => {
    // Es el flujo del técnico: guardar y enviar. Si esto se rompiera, no se
    // podría terminar ningún formulario.
    await construir(InspectionStatus.IN_PROGRESS);

    await expect(
      servicio.update('id-1', { status: InspectionStatus.COMPLETED } as never),
    ).resolves.toBeDefined();
  });

  it('deja dejarla pendiente de aprobación', async () => {
    await construir(InspectionStatus.IN_PROGRESS);

    await expect(
      servicio.update('id-1', {
        status: InspectionStatus.PENDING_APPROVAL,
      } as never),
    ).resolves.toBeDefined();
  });

  it('NO deja aprobarla editándola', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);

    await expect(
      servicio.update('id-1', { status: InspectionStatus.APPROVED } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modelo.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('NO deja rechazarla editándola', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);

    await expect(
      servicio.update('id-1', { status: InspectionStatus.REJECTED } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('NO reabre una ya aprobada', async () => {
    await construir(InspectionStatus.APPROVED);

    await expect(
      servicio.update('id-1', { status: InspectionStatus.DRAFT } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('NO reabre una rechazada', async () => {
    await construir(InspectionStatus.REJECTED);

    await expect(
      servicio.update('id-1', {
        status: InspectionStatus.IN_PROGRESS,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una edición que no toca el estado no consulta el estado actual', async () => {
    // Editar las respuestas de una inspección es lo corriente; no debe pagar
    // una consulta extra ni quedar sujeto a estas reglas.
    await construir(InspectionStatus.APPROVED);

    await servicio.update('id-1', { observations: 'algo' } as never);

    expect(modelo.findById).not.toHaveBeenCalled();
    expect(modelo.findByIdAndUpdate).toHaveBeenCalled();
  });
});
