import { Role } from '../../auth/enums/role.enum';
import {
  alcanceDe,
  normalizarNombre,
  planDentroDelAlcance,
} from './alcance-plan';

const maestro = [
  { area: 'Flotación', superintendencia: 'Superintendencia Planta' },
  { area: 'Chancado', superintendencia: 'Superintendencia Planta' },
  {
    area: 'Taller molienda',
    superintendencia: 'Superintendencia Mantenimiento',
  },
];

const plan = (areaFisica: string, extra: object = {}) => ({
  areaFisica,
  ...extra,
});

describe('normalizarNombre', () => {
  it('ignora espacios de mas, mayusculas y tildes', () => {
    expect(normalizarNombre('  Chancado ')).toBe('chancado');
    expect(normalizarNombre('FLOTACION')).toBe(normalizarNombre('Flotación'));
  });
});

describe('alcance de los planes', () => {
  it('el admin ve todo', () => {
    const alcance = alcanceDe({ roles: [Role.ADMIN] }, maestro);

    expect(planDentroDelAlcance(plan('Cualquiera'), alcance)).toBe(true);
  });

  it('el supervisor ve los de su area, aunque el inspector la escribiera distinto', () => {
    const alcance = alcanceDe(
      { roles: [Role.SUPERVISOR], area: 'Flotación' },
      maestro,
    );

    expect(planDentroDelAlcance(plan('flotacion '), alcance)).toBe(true);
    expect(planDentroDelAlcance(plan('Chancado'), alcance)).toBe(false);
  });

  it('el superintendente ve las areas de su superintendencia, y no las de otra', () => {
    const alcance = alcanceDe(
      {
        roles: [Role.SUPERINTENDENTE],
        superintendencia: 'Superintendencia Planta',
      },
      maestro,
    );

    expect(planDentroDelAlcance(plan('Flotación'), alcance)).toBe(true);
    expect(planDentroDelAlcance(plan('Chancado '), alcance)).toBe(true);
    expect(planDentroDelAlcance(plan('Taller molienda'), alcance)).toBe(false);
  });

  it('tambien ve un plan que diga su superintendencia aunque el area no este en el maestro', () => {
    const alcance = alcanceDe(
      {
        roles: [Role.SUPERINTENDENTE],
        superintendencia: 'Superintendencia Planta',
      },
      maestro,
    );

    expect(
      planDentroDelAlcance(
        plan('Área nueva', { superintendencia: 'superintendencia planta' }),
        alcance,
      ),
    ).toBe(true);
  });

  it('cualquiera ve el plan donde tiene una tarea a su cargo, pero no una dada de baja', () => {
    const alcance = alcanceDe(
      { roles: [Role.SUPERVISOR], area: 'Flotación', username: 'jperez' },
      maestro,
    );
    const ajeno = plan('Chancado', {
      tareas: [{ responsableAreaCierreUsername: 'jperez' }],
    });
    const dadaDeBaja = plan('Chancado', {
      tareas: [{ responsableAreaCierreUsername: 'jperez', activo: false }],
    });

    expect(planDentroDelAlcance(ajeno, alcance)).toBe(true);
    expect(planDentroDelAlcance(dadaDeBaja, alcance)).toBe(false);
  });

  it('con varios responsables de cierre, cualquiera de ellos ve el plan', () => {
    const alcance = alcanceDe(
      { roles: [Role.SUPERVISOR], area: 'Flotación', username: 'mlopez' },
      maestro,
    );
    const compartido = plan('Chancado', {
      tareas: [
        {
          responsableAreaCierreUsername: 'jperez',
          responsablesAreaCierreUsernames: ['jperez', 'mlopez'],
        },
      ],
    });

    expect(planDentroDelAlcance(compartido, alcance)).toBe(true);
  });

  it('sin ficha de trabajador solo ve sus tareas', () => {
    const alcance = alcanceDe({ roles: [Role.SUPERINTENDENTE] }, maestro);

    expect(planDentroDelAlcance(plan('Flotación'), alcance)).toBe(false);
  });

  it('los roles se suman', () => {
    const alcance = alcanceDe(
      {
        roles: [Role.SUPERINTENDENTE, Role.SUPERVISOR],
        superintendencia: 'Superintendencia Mantenimiento',
        area: 'Flotación',
      },
      maestro,
    );

    expect(planDentroDelAlcance(plan('Taller molienda'), alcance)).toBe(true);
    expect(planDentroDelAlcance(plan('Flotación'), alcance)).toBe(true);
    expect(planDentroDelAlcance(plan('Chancado'), alcance)).toBe(false);
  });
});
