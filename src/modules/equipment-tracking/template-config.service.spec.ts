import { TemplateConfigService } from './template-config.service';

/**
 * Es una tabla de consulta con derivaciones — sin base de datos ni red—, así
 * que se prueba directamente, sin `Test.createTestingModule`.
 *
 * Lo que fija este spec es el **contrato de la tabla**: qué pasa con un código
 * que no está, y que las preguntas derivadas (`requiresTracking`,
 * `canOpenDirectly`…) sigan respondiendo lo mismo aunque alguien reordene las
 * entradas.
 */
describe('TemplateConfigService', () => {
  const servicio = new TemplateConfigService();

  const PREUSO_TECLE = '3.04.P37.F24';
  const FRECUENTE_TECLE = '3.04.P37.F25';
  const AMOLADORA = '1.02.P06.F39';
  const MAN_LIFT = '1.02.P06.F37';

  describe('getConfig', () => {
    it('devuelve la configuracion declarada del formulario', () => {
      const config = servicio.getConfig(PREUSO_TECLE);

      expect(config.type).toBe('pre-uso-contador');
      expect(config.usageInterval).toBe(6);
      expect(config.linkedFormCode).toBe(FRECUENTE_TECLE);
    });

    it('un codigo desconocido NO revienta: cae en pre-uso simple', () => {
      // Es la decision de diseno importante de esta tabla: una plantilla nueva
      // sin configurar sigue funcionando, solo que sin seguimiento especial.
      const config = servicio.getConfig('9.99.INVENTADO.F01');

      expect(config.type).toBe('pre-uso');
      expect(config.equipmentFieldName).toBe('TAG');
    });
  });

  describe('requiresTracking', () => {
    it('el pre-uso simple NO lleva seguimiento', () => {
      expect(servicio.requiresTracking(MAN_LIFT)).toBe(false);
    });

    it('el contador y los periodicos SI llevan seguimiento', () => {
      expect(servicio.requiresTracking(PREUSO_TECLE)).toBe(true);
      expect(servicio.requiresTracking(AMOLADORA)).toBe(true);
    });

    it('una plantilla sin configurar no lleva seguimiento', () => {
      expect(servicio.requiresTracking('9.99.INVENTADO.F01')).toBe(false);
    });
  });

  describe('isPreUsoContador / isFrecuenteForm', () => {
    it('distingue el pre-uso con contador de la inspeccion frecuente', () => {
      expect(servicio.isPreUsoContador(PREUSO_TECLE)).toBe(true);
      expect(servicio.isPreUsoContador(FRECUENTE_TECLE)).toBe(false);

      expect(servicio.isFrecuenteForm(FRECUENTE_TECLE)).toBe(true);
      expect(servicio.isFrecuenteForm(PREUSO_TECLE)).toBe(false);
    });
  });

  describe('getPreUsoFormCode', () => {
    it('desde el frecuente se llega a su pre-uso', () => {
      expect(servicio.getPreUsoFormCode(FRECUENTE_TECLE)).toBe(PREUSO_TECLE);
    });

    it('un formulario que no es frecuente no tiene pre-uso asociado', () => {
      expect(servicio.getPreUsoFormCode(AMOLADORA)).toBeNull();
    });
  });

  describe('el enlace entre pre-uso y frecuente es reciproco', () => {
    it('ida y vuelta llevan al mismo par', () => {
      // Si alguien edita un lado y olvida el otro, el equipo queda dando
      // vueltas entre dos formularios que no se reconocen.
      const frecuente = servicio.getConfig(PREUSO_TECLE).linkedFormCode!;
      expect(servicio.getConfig(frecuente).linkedFormCode).toBe(PREUSO_TECLE);
    });
  });

  describe('getEquipmentFieldName', () => {
    it('cada formulario declara con que campo identifica su equipo', () => {
      // No es cosmetico: es el campo del que se lee el codigo para el
      // seguimiento. Si cambia, el equipo deja de reconocerse.
      expect(servicio.getEquipmentFieldName(PREUSO_TECLE)).toBe('TAG');
      expect(servicio.getEquipmentFieldName(AMOLADORA)).toBe(
        'IDENTIFICACIÓN INTERNA DEL EQUIPO',
      );
    });

    it('todas las entradas de la tabla declaran ese campo', () => {
      const sinCampo = Object.entries(servicio.getAllConfigs()).filter(
        ([, config]) => !config.equipmentFieldName,
      );

      expect(sinCampo).toEqual([]);
    });
  });

  describe('canOpenDirectly', () => {
    it('por defecto un formulario se abre directamente', () => {
      expect(servicio.canOpenDirectly(AMOLADORA)).toBe(true);
    });

    it('solo se cierra cuando la configuracion lo dice expresamente', () => {
      const cerrados = Object.entries(servicio.getAllConfigs()).filter(
        ([codigo]) => !servicio.canOpenDirectly(codigo),
      );

      cerrados.forEach(([, config]) => {
        expect(config.canOpenDirectly).toBe(false);
      });
    });
  });
});
