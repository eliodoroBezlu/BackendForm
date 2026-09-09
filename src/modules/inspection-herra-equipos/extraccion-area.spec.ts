import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquipos } from './schemas/inspection-herra-equipos.schema';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';

/**
 * El área se copia de `verification` a su propio campo al crear la inspección.
 *
 * Ese campo es lo que usan los informes, el panel y el filtro por área. Cuando
 * sale vacío no falla nada: la inspección se guarda, y simplemente **no
 * aparece en ninguna vista organizada por área**. Por eso se prueba con las
 * etiquetas reales de las plantillas y no con una inventada.
 *
 * Situación de la base cuando se escribieron estas pruebas: 655 de 2053
 * inspecciones sin el campo, de las cuales 312 tenían el área escrita y bien.
 */
describe('Extracción del área desde verification', () => {
  let extraer: (v: Record<string, string | number>) => string | undefined;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsHerraEquiposService,
        { provide: getModelToken(InspectionHerraEquipos.name), useValue: {} },
        { provide: EquipmentTrackingService, useValue: {} },
        { provide: TemplateConfigService, useValue: { getConfig: () => ({}) } },
        { provide: TemplateHerraEquiposService, useValue: {} },
      ],
    }).compile();

    const servicio = module.get(InspectionsHerraEquiposService);
    // Método privado: se prueba por su nombre porque es donde vive la regla.
    extraer = (
      servicio as unknown as {
        extractAreaFromVerification: (
          v: Record<string, string | number>,
        ) => string | undefined;
      }
    ).extractAreaFromVerification.bind(servicio);
  });

  describe('etiquetas que ya funcionaban', () => {
    it.each([
      ['AREA', '2.03.P10.F05'],
      ['ÁREA', '1.02.P06.F37'],
      ['Área', '3.04.P37.F24'],
      ['Area', '3.04.P37.F25'],
      ['ÁREA/SECCIÓN', '1.02.P06.F19'],
    ])('«%s» (%s)', (etiqueta) => {
      expect(extraer({ [etiqueta]: 'Molienda' })).toBe('Molienda');
    });
  });

  describe('etiquetas que se perdían', () => {
    it.each([
      ['UBICACIÓN FÍSICA EL EQUIPO', 'F39/F40/F42 — con la errata «EL»'],
      ['UBICACIÓN FÍSICA DEL EQUIPO', '2.03.P10.F05'],
      ['AREA FÍSICA DE UBICACIÓN DE LA ESCALERA', '1.02.P06.F33'],
      ['ÁREA FÍSICA DEL MONTAJE DEL ANDAMIO', '1.02.P06.F30'],
    ])('«%s» — %s', (etiqueta) => {
      expect(extraer({ [etiqueta]: 'Taller Soldadura' })).toBe(
        'Taller Soldadura',
      );
    });
  });

  it('prefiere el área sobre la ubicación cuando están las dos', () => {
    // `2.03.P10.F05` pide ambas. Un área es dónde trabaja la cuadrilla; una
    // ubicación puede ser «Caja soldadura 320», un sitio dentro del área.
    expect(
      extraer({
        AREA: 'Taller General',
        'UBICACIÓN FÍSICA DEL EQUIPO': 'Caja soldadura 320',
      }),
    ).toBe('Taller General');
  });

  it('ignora los campos que nombran a una persona', () => {
    // `1.02.P06.F37` tiene « SUPERVISOR DE ÁREA», que lleva «área» en la
    // etiqueta y un nombre propio dentro.
    expect(
      extraer({
        ' SUPERVISOR DE ÁREA': 'Condarco Fuentes Jhony',
        ÁREA: 'Chancado',
      }),
    ).toBe('Chancado');
  });

  it('no devuelve una persona aunque sea el único campo con «área»', () => {
    expect(
      extraer({ ' SUPERVISOR DE ÁREA': 'Condarco Fuentes Jhony' }),
    ).toBeUndefined();
  });

  it('un campo vacío no cuenta: sigue buscando', () => {
    expect(
      extraer({ AREA: '   ', 'UBICACIÓN FÍSICA EL EQUIPO': 'Filtros' }),
    ).toBe('Filtros');
  });

  it('recorta los espacios', () => {
    expect(extraer({ AREA: '  Molienda  ' })).toBe('Molienda');
  });

  it('sin ningún campo de área devuelve indefinido', () => {
    expect(extraer({ TAG: '519-A-0003', FECHA: '2026-09-09' })).toBeUndefined();
  });

  it('aguanta un verification vacío', () => {
    expect(extraer({})).toBeUndefined();
  });
});
