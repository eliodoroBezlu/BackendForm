import {
  calcularDiasRetraso,
  calcularMetadatos,
  soloTareasActivas,
  type TareaCalculable,
} from './metadatos-plan';

/** Fecha local, sin la ambigüedad de zona horaria de 'YYYY-MM-DD'. */
const fecha = (anio: number, mes: number, dia: number, hora = 0) =>
  new Date(anio, mes - 1, dia, hora);

const tarea = (estado: string, activo?: boolean): TareaCalculable => ({
  estado,
  ...(activo === undefined ? {} : { activo }),
});

describe('soloTareasActivas', () => {
  it('deja fuera las tareas dadas de baja', () => {
    const tareas = [
      tarea('abierto', true),
      tarea('cerrado', false),
      tarea('abierto', true),
    ];

    expect(soloTareasActivas(tareas)).toHaveLength(2);
  });

  it('cuenta como activa la tarea que no tiene el campo', () => {
    // Las tareas creadas antes de que existiera `activo` no lo llevan.
    // Si se exigiera `activo === true` desaparecerian del plan.
    expect(soloTareasActivas([tarea('abierto')])).toHaveLength(1);
  });

  it('tolera que no haya tareas', () => {
    expect(soloTareasActivas(undefined)).toEqual([]);
    expect(soloTareasActivas(null)).toEqual([]);
    expect(soloTareasActivas([])).toEqual([]);
  });

  it('no modifica el array original', () => {
    const tareas = [tarea('abierto', true), tarea('cerrado', false)];
    soloTareasActivas(tareas);
    expect(tareas).toHaveLength(2);
  });
});

describe('calcularDiasRetraso', () => {
  it('no hay retraso mientras la tarea no se ha cerrado', () => {
    expect(calcularDiasRetraso(fecha(2026, 1, 10))).toBe(0);
    expect(calcularDiasRetraso(fecha(2026, 1, 10), null)).toBe(0);
  });

  it('cuenta los dias de calendario que pasaron de la fecha acordada', () => {
    expect(calcularDiasRetraso(fecha(2026, 1, 10), fecha(2026, 1, 13))).toBe(3);
  });

  it('cerrar el mismo dia no es retraso, aunque sea a ultima hora', () => {
    // Se comparan dias, no instantes: las 23:00 del dia acordado siguen
    // siendo el dia acordado.
    expect(
      calcularDiasRetraso(fecha(2026, 1, 10, 8), fecha(2026, 1, 10, 23)),
    ).toBe(0);
  });

  it('adelantarse no resta: nunca devuelve negativos', () => {
    expect(calcularDiasRetraso(fecha(2026, 1, 10), fecha(2026, 1, 5))).toBe(0);
  });

  it('cruza el cambio de mes y de anio', () => {
    expect(calcularDiasRetraso(fecha(2025, 12, 30), fecha(2026, 1, 2))).toBe(3);
  });

  it('devuelve 0 ante una fecha invalida en vez de NaN', () => {
    // Un NaN se propagaria hasta el documento guardado sin que nada avise.
    expect(
      calcularDiasRetraso(new Date('no-es-fecha'), fecha(2026, 1, 2)),
    ).toBe(0);
  });

  it('no altera las fechas que recibe', () => {
    const acordada = fecha(2026, 1, 10, 15);
    const efectiva = fecha(2026, 1, 12, 9);
    calcularDiasRetraso(acordada, efectiva);

    expect(acordada.getHours()).toBe(15);
    expect(efectiva.getHours()).toBe(9);
  });
});

describe('calcularMetadatos', () => {
  it('un plan sin tareas esta abierto, no cerrado', () => {
    const m = calcularMetadatos([]);

    expect(m.estado).toBe('abierto');
    expect(m.totalTareas).toBe(0);
    expect(m.porcentajeCierre).toBe(0);
  });

  it('cuenta las tareas por estado', () => {
    const m = calcularMetadatos([
      tarea('abierto'),
      tarea('abierto'),
      tarea('en-progreso'),
      tarea('cerrado'),
    ]);

    expect(m.totalTareas).toBe(4);
    expect(m.tareasAbiertas).toBe(2);
    expect(m.tareasEnProgreso).toBe(1);
    expect(m.tareasCerradas).toBe(1);
  });

  it('el plan sigue abierto mientras nada se ha movido', () => {
    const m = calcularMetadatos([tarea('abierto'), tarea('abierto')]);
    expect(m.estado).toBe('abierto');
  });

  it('basta una tarea en progreso para que el plan lo este', () => {
    const m = calcularMetadatos([tarea('abierto'), tarea('en-progreso')]);
    expect(m.estado).toBe('en-progreso');
  });

  it('una tarea cerrada tambien pone el plan en progreso', () => {
    const m = calcularMetadatos([tarea('abierto'), tarea('cerrado')]);
    expect(m.estado).toBe('en-progreso');
  });

  it('el plan solo cierra cuando cierran TODAS sus tareas', () => {
    expect(calcularMetadatos([tarea('cerrado'), tarea('cerrado')]).estado).toBe(
      'cerrado',
    );
    expect(calcularMetadatos([tarea('cerrado'), tarea('abierto')]).estado).toBe(
      'en-progreso',
    );
  });

  it('redondea el porcentaje de cierre', () => {
    // 1 de 3 = 33,33 %
    const m = calcularMetadatos([
      tarea('cerrado'),
      tarea('abierto'),
      tarea('abierto'),
    ]);
    expect(m.porcentajeCierre).toBe(33);
  });

  it('un estado desconocido no cuenta en ninguna categoria', () => {
    const m = calcularMetadatos([tarea('pendiente-revision')]);

    expect(m.totalTareas).toBe(1);
    expect(m.tareasAbiertas + m.tareasEnProgreso + m.tareasCerradas).toBe(0);
    expect(m.estado).toBe('abierto');
  });
});
