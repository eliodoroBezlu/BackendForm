import { Role } from '../../auth/enums/role.enum';
import { planEsVisible, puedeVerPlanesSinAprobar } from './visibilidad-plan';

describe('puedeVerPlanesSinAprobar', () => {
  it('el admin y el superintendente ven el catalogo completo', () => {
    expect(puedeVerPlanesSinAprobar([Role.ADMIN])).toBe(true);
    expect(puedeVerPlanesSinAprobar([Role.SUPERINTENDENTE])).toBe(true);
  });

  it('el supervisor NO ve planes sin aprobar', () => {
    expect(puedeVerPlanesSinAprobar([Role.SUPERVISOR])).toBe(false);
  });

  it('un supervisor que ademas es admin si los ve', () => {
    expect(puedeVerPlanesSinAprobar([Role.SUPERVISOR, Role.ADMIN])).toBe(true);
  });

  it('sin roles se restringe: ante la duda, no', () => {
    expect(puedeVerPlanesSinAprobar()).toBe(false);
    expect(puedeVerPlanesSinAprobar(null)).toBe(false);
    expect(puedeVerPlanesSinAprobar([])).toBe(false);
  });

  it('un rol desconocido no abre la puerta', () => {
    expect(puedeVerPlanesSinAprobar(['rol_inventado'])).toBe(false);
  });
});

describe('planEsVisible', () => {
  const aprobado = { estadoAprobacion: 'aprobado' };
  const pendiente = { estadoAprobacion: 'pendiente' };

  it('un plan aprobado lo ve cualquiera', () => {
    expect(planEsVisible(aprobado, [Role.SUPERVISOR])).toBe(true);
    expect(planEsVisible(aprobado, [])).toBe(true);
  });

  it('un plan pendiente solo lo ve quien tiene vision completa', () => {
    expect(planEsVisible(pendiente, [Role.SUPERVISOR])).toBe(false);
    expect(planEsVisible(pendiente, [Role.SUPERINTENDENTE])).toBe(true);
  });

  it('un plan sin estado de aprobacion se trata como pendiente', () => {
    // Ocurre con los planes anteriores a que existiera el campo: no deben
    // filtrarse al supervisor solo porque el dato falte.
    expect(planEsVisible({}, [Role.SUPERVISOR])).toBe(false);
    expect(planEsVisible({}, [Role.ADMIN])).toBe(true);
  });
});
