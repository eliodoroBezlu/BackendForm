import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  const SUPERVISOR = { username: 'jperez', roles: ['supervisor'] };
  const INSPECTOR = { username: 'tecnico1', roles: ['inspector'] };

  /** Lo que se mandó a escribir en el último `findByIdAndUpdate`. */
  const escrito = () =>
    (
      (modelo.findByIdAndUpdate.mock.calls as unknown[][])[0][1] as {
        $set: Record<string, unknown>;
      }
    ).$set;

  it('un supervisor aprueba una pendiente, y quién y cuándo salen de la sesión', async () => {
    // Es el flujo del formulario de detalle: firma del supervisor + decisión
    // en la misma petición. Desde el 2026-09-26 esto fallaba y nadie podía
    // aprobar.
    await construir(InspectionStatus.PENDING_APPROVAL);

    await servicio.update(
      'id-1',
      {
        status: InspectionStatus.APPROVED,
        supervisorSignature: { nombre: 'J. Pérez' },
        approval: {
          status: 'approved',
          approvedBy: 'alguien-que-no-es',
          supervisorComments: 'ok',
        },
      } as never,
      SUPERVISOR,
    );

    const set = escrito();
    expect(set.status).toBe(InspectionStatus.APPROVED);
    expect(set.supervisorSignature).toEqual({ nombre: 'J. Pérez' });
    expect(set.approval).toMatchObject({
      status: 'approved',
      approvedBy: 'jperez', // no el que mandó el navegador
      supervisorComments: 'ok',
    });
  });

  it('un supervisor rechaza una pendiente con su motivo', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);

    await servicio.update(
      'id-1',
      {
        status: InspectionStatus.REJECTED,
        approval: { status: 'rejected', rejectionReason: 'falta foto' },
      } as never,
      SUPERVISOR,
    );

    expect(escrito().approval).toMatchObject({
      status: 'rejected',
      approvedBy: 'jperez',
      rejectionReason: 'falta foto',
    });
  });

  it('NO deja aprobar a quien no tiene rol aprobador', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);

    await expect(
      servicio.update(
        'id-1',
        { status: InspectionStatus.APPROVED } as never,
        INSPECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(modelo.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('NO deja rechazar sin sesión (llamada sin actor)', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);

    await expect(
      servicio.update('id-1', { status: InspectionStatus.REJECTED } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('andamio: pasar de pendiente a en curso es aprobarlo, y exige rol', async () => {
    // Antes esta vía estaba abierta a cualquiera: `in_progress` no se
    // consideraba una aprobación.
    await construir(InspectionStatus.PENDING_APPROVAL);
    await expect(
      servicio.update(
        'id-1',
        { status: InspectionStatus.IN_PROGRESS } as never,
        INSPECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await construir(InspectionStatus.PENDING_APPROVAL);
    await servicio.update(
      'id-1',
      { status: InspectionStatus.IN_PROGRESS } as never,
      SUPERVISOR,
    );
    expect(escrito().approval).toMatchObject({
      status: 'approved',
      approvedBy: 'jperez',
    });
  });

  it('NO deja aprobar algo que no estaba pendiente', async () => {
    await construir(InspectionStatus.IN_PROGRESS);

    await expect(
      servicio.update(
        'id-1',
        { status: InspectionStatus.APPROVED } as never,
        SUPERVISOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una decisión en `approval` sin resolver la inspección se ignora', async () => {
    // Un andamio ya aprobado que guarda su rutinaria manda de vuelta su
    // `approval`; tampoco se puede colar una aprobación por este campo.
    await construir(InspectionStatus.IN_PROGRESS);

    await servicio.update(
      'id-1',
      {
        status: InspectionStatus.IN_PROGRESS,
        approval: { status: 'approved', approvedBy: 'yo-mismo' },
      } as never,
      INSPECTOR,
    );

    expect(escrito().approval).toBeUndefined();
  });

  it('si el seguimiento del equipo falla, la aprobación queda hecha igual', async () => {
    await construir(InspectionStatus.PENDING_APPROVAL);
    modelo.findByIdAndUpdate = jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({
        _id: 'id-1',
        templateCode: '3.04.P48.F03',
        verification: {},
      }),
    }));

    await expect(
      servicio.update(
        'id-1',
        { status: InspectionStatus.APPROVED } as never,
        SUPERVISOR,
      ),
    ).resolves.toMatchObject({ _id: 'id-1' });
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
