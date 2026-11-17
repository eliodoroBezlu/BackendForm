import {
  FichaIam,
  FichaLocal,
  planificar,
  planificarRol,
} from './plan-de-sincronizacion';

const iam = (extra: Partial<FichaIam> = {}): FichaIam => ({
  id: 'iam-1',
  ci: '111',
  nomina: 'ANA PEREZ',
  puesto: 'Mecánica',
  superintendencia: 'Planta',
  area: 'Chancado',
  jde: null,
  celular: null,
  residencia: null,
  noBloque: null,
  noHabitacion: null,
  fechaIngreso: null,
  tieneAccesoSistema: false,
  activo: true,
  username: null,
  ...extra,
});

const local = (extra: Partial<FichaLocal> = {}): FichaLocal => ({
  id: 'loc-1',
  iam_trabajador_id: 'iam-1',
  ci: '111',
  nomina: 'ANA PEREZ',
  puesto: 'Mecánica',
  superintendencia: 'Planta',
  area: 'Chancado',
  tiene_acceso_sistema: false,
  ...extra,
});

describe('planificar', () => {
  it('una ficha del IAM que no está en forms es nueva, con sus datos', () => {
    const plan = planificar([iam()], []);
    expect(plan.nuevos).toHaveLength(1);
    expect(plan.nuevos[0]).toMatchObject({
      idIam: 'iam-1',
      tipo: 'nuevo',
      nomina: 'ANA PEREZ',
      datos: { iam_trabajador_id: 'iam-1', area: 'Chancado', activo: true },
    });
  });

  it('una ficha igual no aparece: solo cuenta como sin cambios', () => {
    const plan = planificar([iam()], [local()]);
    expect(plan.sinCambios).toBe(1);
    expect(plan.conCambios).toHaveLength(0);
  });

  it('muestra qué dato cambia, de qué a qué', () => {
    const plan = planificar([iam({ area: 'Molienda' })], [local()]);
    expect(plan.conCambios[0].cambios).toEqual([
      {
        campo: 'area',
        etiqueta: 'Área',
        antes: 'Chancado',
        despues: 'Molienda',
      },
    ]);
    expect(plan.conCambios[0].datos).toEqual({ area: 'Molienda' });
  });

  it('un dato vacío en el IAM no borra el de forms', () => {
    const plan = planificar(
      [iam({ celular: null })],
      [local({ celular: '70000000' })],
    );
    expect(plan.sinCambios).toBe(1);
  });

  it('una ficha vieja sin vínculo se empareja por CI y queda vinculada', () => {
    const plan = planificar([iam()], [local({ iam_trabajador_id: null })]);
    expect(plan.nuevos).toHaveLength(0);
    expect(plan.conCambios[0].datos).toEqual({ iam_trabajador_id: 'iam-1' });
  });

  describe('bajas', () => {
    it('dada de baja en el IAM y activa en forms', () => {
      const plan = planificar([iam({ activo: false })], [local()]);
      expect(plan.bajas[0]).toMatchObject({
        idIam: 'iam-1',
        idLocal: 'loc-1',
        motivo: 'Dado de baja en el Portal IAM',
      });
    });

    it('vinculada a una ficha que ya no existe en el IAM', () => {
      const plan = planificar([], [local()]);
      expect(plan.bajas[0].motivo).toBe('Ya no está en el Portal IAM');
    });

    it('si ya está de baja en forms no se repite', () => {
      expect(
        planificar([iam({ activo: false })], [local({ activo: false })]).bajas,
      ).toHaveLength(0);
    });

    it('inactiva en el IAM y sin ficha en forms: se ignora', () => {
      const plan = planificar([iam({ activo: false })], []);
      expect(plan.nuevos).toHaveLength(0);
      expect(plan.bajas).toHaveLength(0);
    });

    it('activa en el IAM y de baja en forms: vuelve a estar activa', () => {
      const plan = planificar([iam()], [local({ activo: false })]);
      expect(plan.conCambios[0].cambios).toContainEqual(
        expect.objectContaining({ etiqueta: 'Estado', despues: 'Activo' }),
      );
      expect(plan.conCambios[0].datos).toMatchObject({ activo: true });
    });
  });

  describe('problemas', () => {
    it('la CI del IAM ya la tiene otra persona en forms', () => {
      const plan = planificar(
        [iam({ id: 'iam-2', ci: '111', nomina: 'OTRA' })],
        [local()],
      );
      expect(plan.problemas[0]).toMatchObject({
        idIam: 'iam-2',
        tipo: 'problema',
      });
      expect(plan.problemas[0].motivo).toMatch(/111.*ANA PEREZ/);
      expect(plan.nuevos).toHaveLength(0);
    });

    it('una ficha nueva sin nómina o sin puesto no se puede copiar', () => {
      const plan = planificar([iam({ nomina: '', puesto: '' })], []);
      expect(plan.problemas[0].motivo).toBe(
        'Falta la nómina y el puesto en el Portal IAM.',
      );
    });
  });
});

describe('planificarRol', () => {
  it('gana quien tiene el rol en el IAM y no en forms; pierde el caso contrario', () => {
    const plan = planificarRol(
      'supervisor',
      [{ idIam: 'iam-1', nomina: 'ANA PEREZ' }],
      [
        local(),
        local({
          id: 'loc-2',
          iam_trabajador_id: 'iam-2',
          nomina: 'LUIS',
          roles_iam: ['supervisor'],
        }),
      ],
    );
    expect(plan.ganan).toEqual([{ idIam: 'iam-1', nomina: 'ANA PEREZ' }]);
    expect(plan.pierden).toEqual([{ idIam: 'iam-2', nomina: 'LUIS' }]);
  });

  it('quien ya tiene el rol en los dos lados no aparece', () => {
    const plan = planificarRol(
      'supervisor',
      [{ idIam: 'iam-1', nomina: 'ANA PEREZ' }],
      [local({ roles_iam: ['supervisor'] })],
    );
    expect(plan.ganan).toHaveLength(0);
    expect(plan.pierden).toHaveLength(0);
  });
});
