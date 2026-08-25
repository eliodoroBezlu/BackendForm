import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquipos } from './schemas/inspection-herra-equipos.schema';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';
import { InspectionStatus } from './types/IProps';

/**
 * Guardar una inspección y anotar su seguimiento son dos cosas, y solo una es
 * la que pidió quien llamó.
 *
 * El caso real: la revisión 5 de `1.02.P06.F19` reorganizó el formulario y el
 * código del equipo dejó de estar en `verification` —ahora va dentro de las
 * secciones, una por elemento del SPCC—. La configuración de seguimiento
 * seguía apuntando a `COD. ARNÉS` en `verification`, no lo encontraba y
 * lanzaba `BadRequestException`. Como la excepción subía sin filtro, la
 * respuesta era un 400 y el inspector leía «Error al guardar borrador»…
 * **con su inspección ya guardada en la base**. Volvía a llenarla entera.
 */

const DOCUMENTO_GUARDADO = {
  _id: 'insp-nueva',
  status: InspectionStatus.DRAFT,
  requiresApproval: false,
};

describe('Crear inspección · el seguimiento no puede tumbar el guardado', () => {
  let servicio: InspectionsHerraEquiposService;
  let guardar: jest.Mock;
  let registrarSeguimiento: jest.Mock;

  const dto = {
    templateCode: '1.02.P06.F19',
    verification: {
      SUPERINTENDENCIA: 'X',
      'ÁREA/SECCIÓN': 'Y',
      FECHA: '2026-08-25',
    },
    responses: {},
    submittedBy: 'eliodoro',
    status: InspectionStatus.DRAFT,
  } as never;

  beforeEach(async () => {
    guardar = jest.fn().mockResolvedValue(DOCUMENTO_GUARDADO);
    registrarSeguimiento = jest.fn();

    // El modelo se usa con `new`, así que el doble tiene que ser constructible.
    const ModeloFalso = function (this: Record<string, unknown>) {
      this.save = guardar;
    } as unknown as new () => unknown;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        {
          provide: getModelToken(InspectionHerraEquipos.name),
          useValue: ModeloFalso,
        },
        {
          provide: EquipmentTrackingService,
          useValue: {
            registerInspectionWithAutoTracking: registrarSeguimiento,
            resetPreUsoCounter: jest.fn(),
          },
        },
        {
          provide: TemplateConfigService,
          useValue: {
            // `mensual` es lo que hace que se intente el seguimiento; con
            // `pre-uso` el servicio sale antes y no probaría nada.
            getConfig: () => ({
              type: 'mensual',
              intervalDays: 30,
              equipmentFieldName: 'COD. ARNÉS',
            }),
          },
        },
        {
          provide: TemplateHerraEquiposService,
          useValue: { findByCode: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    servicio = module.get(InspectionsHerraEquiposService);
  });

  it('devuelve la inspección aunque el seguimiento falle', async () => {
    registrarSeguimiento.mockRejectedValue(
      new BadRequestException(
        'Campo COD. ARNÉS no encontrado en el formulario',
      ),
    );

    const resultado = await servicio.create(dto);

    expect(guardar).toHaveBeenCalled();
    expect(resultado.inspection).toBe(DOCUMENTO_GUARDADO);
  });

  it('no propaga el fallo del seguimiento como error de la petición', async () => {
    registrarSeguimiento.mockRejectedValue(
      new BadRequestException(
        'Campo COD. ARNÉS no encontrado en el formulario',
      ),
    );

    // Esto es lo que devolvía un 400 y hacía repetir el formulario entero.
    await expect(servicio.create(dto)).resolves.toBeDefined();
  });

  it('avisa de lo que no se anotó, en vez de callarlo', async () => {
    registrarSeguimiento.mockRejectedValue(
      new BadRequestException(
        'Campo COD. ARNÉS no encontrado en el formulario',
      ),
    );

    const resultado = await servicio.create(dto);

    expect(resultado.warning).toContain('se guardó');
    expect(resultado.warning).toContain('COD. ARNÉS');
  });

  it('cuando el seguimiento va bien, sigue devolviéndolo', async () => {
    registrarSeguimiento.mockResolvedValue({
      message: 'ok',
      tracking: { equipmentId: '519-A-0003' },
      needsFrecuenteInspection: false,
    });

    const resultado = await servicio.create(dto);

    expect(resultado.tracking).toEqual({ equipmentId: '519-A-0003' });
    expect(resultado.warning).toBeNull();
  });

  it('un fallo al GUARDAR sí es un error de verdad', async () => {
    // El seguimiento es accesorio; el guardado no. Si lo que falla es la
    // escritura, quien llama tiene que enterarse.
    guardar.mockRejectedValue(new Error('mongo caído'));

    await expect(servicio.create(dto)).rejects.toThrow('mongo caído');
  });
});
