import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { TemplateConfigService } from './template-config.service';
import { EquipmentInspectionTracking } from './schemas/equipment-tracking.schema';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';
import { EquiposService } from '../equipos/equipos.service';

/**
 * `checkEquipmentStatus` es la puerta de entrada de una inspección: decide si
 * el usuario puede seguir con el formulario que pidió o hay que mandarlo a
 * otro. Es la regla que un tecle no se inspeccione seis veces seguidas sin
 * pasar por la revisión frecuente.
 *
 * Se prueba con el modelo de seguimiento simulado: lo que importa aquí es la
 * decisión, no cómo se guarda.
 */

const PREUSO_TECLE = '3.04.P37.F24';
const FRECUENTE_TECLE = '3.04.P37.F25';
const MAN_LIFT = '1.02.P06.F37'; // pre-uso simple, sin seguimiento
const AMOLADORA = '1.02.P06.F39'; // periodico mensual

/** `findOne(...).exec()` devuelve lo que se le indique. */
const modeloConSeguimiento = (seguimiento: unknown) => ({
  findOne: jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(seguimiento),
  }),
  find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
  create: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue([]),
});

describe('EquipmentTrackingService · checkEquipmentStatus', () => {
  const construir = async (seguimiento: unknown) => {
    const modelo = modeloConSeguimiento(seguimiento);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquipmentTrackingService,
        TemplateConfigService,
        {
          provide: getModelToken(EquipmentInspectionTracking.name),
          useValue: modelo,
        },
        // Estos dos solo participan en otros metodos del servicio; para
        // `checkEquipmentStatus` basta con que existan.
        {
          provide: TemplateHerraEquiposService,
          useValue: { findByCode: jest.fn(), findAll: jest.fn() },
        },
        { provide: EquiposService, useValue: { findAll: jest.fn() } },
      ],
    }).compile();

    return {
      servicio: module.get<EquipmentTrackingService>(EquipmentTrackingService),
      modelo,
    };
  };

  describe('inspeccion frecuente (F25)', () => {
    it('un equipo sin historial se manda al pre-uso', async () => {
      const { servicio } = await construir(null);

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: FRECUENTE_TECLE,
      });

      expect(resultado.shouldRedirect).toBe(true);
      expect(resultado.openForm).toBe(PREUSO_TECLE);
    });

    it('si aun no toca la frecuente, se devuelve al pre-uso con la cuenta', async () => {
      const { servicio } = await construir({
        preUsoCount: 2,
        needsFrecuenteInspection: false,
      });

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: FRECUENTE_TECLE,
      });

      expect(resultado.shouldRedirect).toBe(true);
      expect(resultado.openForm).toBe(PREUSO_TECLE);
      expect(resultado.trackingData).toMatchObject({
        preUsoCount: 2,
        usageInterval: 6,
        remainingUses: 4, // 6 - 2
      });
    });

    it('cuando toca la frecuente, se permite y NO se redirige', async () => {
      const { servicio } = await construir({
        preUsoCount: 6,
        needsFrecuenteInspection: true,
      });

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: FRECUENTE_TECLE,
      });

      expect(resultado.canProceed).toBe(true);
      expect(resultado.shouldRedirect).toBe(false);
      expect(resultado.openForm).toBe(FRECUENTE_TECLE);
    });

    it('busca el seguimiento del PRE-USO, no el del frecuente', async () => {
      // El contador vive en el pre-uso; consultar el del frecuente daria
      // siempre vacio y el equipo quedaria atrapado en el bucle de redireccion.
      const { servicio, modelo } = await construir(null);

      await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: FRECUENTE_TECLE,
      });

      expect(modelo.findOne).toHaveBeenCalledWith({
        equipmentId: 'TAG-001',
        templateCode: PREUSO_TECLE,
      });
    });
  });

  describe('pre-uso con contador (F24)', () => {
    it('un equipo nuevo puede hacer su primer pre-uso', async () => {
      const { servicio } = await construir(null);

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-NUEVO',
        requestedTemplateCode: PREUSO_TECLE,
      });

      expect(resultado.canProceed).toBe(true);
      expect(resultado.shouldRedirect).toBe(false);
      expect(resultado.trackingData).toMatchObject({
        preUsoCount: 0,
        remainingUses: 6,
      });
    });

    it('LA REGLA: agotados los pre-usos, se obliga a la frecuente', async () => {
      const { servicio } = await construir({
        preUsoCount: 6,
        needsFrecuenteInspection: true,
      });

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: PREUSO_TECLE,
      });

      expect(resultado.shouldRedirect).toBe(true);
      expect(resultado.openForm).toBe(FRECUENTE_TECLE);
    });

    it('mientras queden pre-usos, se permite y se informa cuantos faltan', async () => {
      const { servicio } = await construir({
        preUsoCount: 4,
        needsFrecuenteInspection: false,
      });

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: PREUSO_TECLE,
      });

      expect(resultado.shouldRedirect).toBe(false);
      expect(resultado.trackingData?.remainingUses).toBe(2);
    });

    it('un contador pasado de vuelta no produce restantes negativos', async () => {
      const { servicio } = await construir({
        preUsoCount: 9, // mas de los 6 del intervalo
        needsFrecuenteInspection: false,
      });

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'TAG-001',
        requestedTemplateCode: PREUSO_TECLE,
      });

      expect(resultado.trackingData?.remainingUses).toBe(0);
    });
  });

  describe('formularios sin seguimiento especial', () => {
    it('un pre-uso simple pasa directo, sin consultar el seguimiento', async () => {
      const { servicio, modelo } = await construir(null);

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'ML-01',
        requestedTemplateCode: MAN_LIFT,
      });

      expect(resultado.canProceed).toBe(true);
      expect(resultado.shouldRedirect).toBe(false);
      // Ni siquiera toca la base: no hay nada que consultar.
      expect(modelo.findOne).not.toHaveBeenCalled();
    });

    it('un formulario periodico pasa directo', async () => {
      const { servicio } = await construir(null);

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'AM-01',
        requestedTemplateCode: AMOLADORA,
      });

      expect(resultado.canProceed).toBe(true);
      expect(resultado.shouldRedirect).toBe(false);
      expect(resultado.openForm).toBe(AMOLADORA);
    });

    it('una plantilla sin configurar pasa directo, no bloquea', async () => {
      const { servicio } = await construir(null);

      const resultado = await servicio.checkEquipmentStatus({
        equipmentId: 'X-01',
        requestedTemplateCode: '9.99.INVENTADO.F01',
      });

      expect(resultado.canProceed).toBe(true);
      expect(resultado.shouldRedirect).toBe(false);
    });
  });

  describe('invariante general', () => {
    it('ninguna combinacion deja al usuario sin formulario que abrir', async () => {
      const casos = [
        [FRECUENTE_TECLE, null],
        [FRECUENTE_TECLE, { preUsoCount: 1, needsFrecuenteInspection: false }],
        [FRECUENTE_TECLE, { preUsoCount: 6, needsFrecuenteInspection: true }],
        [PREUSO_TECLE, null],
        [PREUSO_TECLE, { preUsoCount: 6, needsFrecuenteInspection: true }],
        [MAN_LIFT, null],
        [AMOLADORA, null],
      ] as const;

      for (const [codigo, seguimiento] of casos) {
        const { servicio } = await construir(seguimiento);
        const resultado = await servicio.checkEquipmentStatus({
          equipmentId: 'TAG-001',
          requestedTemplateCode: codigo,
        });

        // Un `openForm` vacio deja la pantalla en blanco sin explicacion.
        expect(resultado.openForm).toBeTruthy();
        expect(resultado.message).toBeTruthy();
      }
    });
  });
});
