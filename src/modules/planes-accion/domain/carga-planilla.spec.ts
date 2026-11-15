import {
  type FilaDePlanilla,
  planificarCarga,
  type TareaDelPlan,
} from './carga-planilla';

const hoy = new Date('2026-11-06T15:00:00Z');
const responsables = [
  { nomina: 'Aguayo Rojas Victor Hugo', username: 'vaguayo' },
  { nomina: 'Balladares Rocha Saúl Ramiro', username: 'sballadares' },
];

const tarea = (extra: Partial<TareaDelPlan> = {}): TareaDelPlan => ({
  _id: 't1',
  activo: true,
  aprobado: false,
  estado: 'abierto',
  fechaHallazgo: new Date('2026-10-21T04:00:00Z'),
  responsableObservacion: 'Pérez Juan',
  empresa: 'MSC',
  lugarFisico: 'Filtros',
  actividad: 'Mantenimiento',
  descripcionObservacion: 'Bidones sin etiqueta',
  familiaPeligro: '',
  accionPropuesta: '',
  responsableAreaCierre: '',
  evidencias: [],
  historial: [{ fecha: '2026-10-21T15:00:00Z', usuario: 'eliodoro' }],
  ...extra,
});

/** La fila tal como la escribe la descarga para esa tarea. */
const filaDe = (
  t: TareaDelPlan,
  extra: Partial<FilaDePlanilla> = {},
): FilaDePlanilla => ({
  fila: 12,
  item: 1,
  tareaId: t._id,
  version: t.historial?.length ?? 0,
  tieneDatos: true,
  fechaHallazgo: t.fechaHallazgo as Date,
  responsableObservacion: t.responsableObservacion,
  empresa: t.empresa,
  lugarFisico: t.lugarFisico,
  actividad: t.actividad,
  descripcionObservacion: t.descripcionObservacion,
  familiaPeligro: t.familiaPeligro || undefined,
  accionPropuesta: t.accionPropuesta || undefined,
  responsableAreaCierre: t.responsableAreaCierre || undefined,
  fechaCumplimientoAcordada: t.fechaCumplimientoAcordada as Date | undefined,
  fechaCumplimientoEfectiva: t.fechaCumplimientoEfectiva as Date | undefined,
  ...extra,
});

const completar = {
  familiaPeligro: 'Sustancias peligrosas',
  accionPropuesta: 'Etiquetar los bidones según la hoja de seguridad',
  responsableAreaCierre: 'aguayo rojas victor hugo',
  fechaCumplimientoAcordada: new Date('2026-11-20T00:00:00Z'),
};

const planificar = (filas: FilaDePlanilla[], tareas: TareaDelPlan[]) =>
  planificarCarga({ filas, tareas, responsables, hoy });

describe('planificarCarga', () => {
  it('la planilla tal como se bajó no cambia nada', () => {
    const t = tarea({
      ...completar,
      responsableAreaCierre: 'Aguayo Rojas Victor Hugo',
    });
    const [r] = planificar([filaDe(t)], [t]);
    expect(r.resultado).toBe('sin-cambios');
    expect(r.pasos).toEqual([]);
  });

  it('completar lo que pide En progreso hace avanzar la tarea, con usuarios', () => {
    const t = tarea();
    const [r] = planificar([filaDe(t, completar)], [t]);
    expect(r.resultado).toBe('actualiza');
    expect(r.pasos).toHaveLength(1);
    expect(r.pasos[0]).toMatchObject({
      estado: 'en-progreso',
      responsableAreaCierre: 'Aguayo Rojas Victor Hugo',
      responsablesAreaCierreUsernames: ['vaguayo'],
      responsableAreaCierreUsername: 'vaguayo',
    });
    expect(r.cambios.map((c) => c.campo)).toContain('estado');
  });

  it('a medias queda Abierta y dice qué falta', () => {
    const t = tarea();
    const [r] = planificar(
      [filaDe(t, { familiaPeligro: 'Sustancias peligrosas' })],
      [t],
    );
    expect(r.resultado).toBe('actualiza');
    expect(r.pasos).toEqual([{ familiaPeligro: 'Sustancias peligrosas' }]);
    expect(r.avisos.join(' ')).toMatch(/Queda Abierta.*acción propuesta/);
  });

  it('con fecha efectiva y evidencia se cierra en dos pasos', () => {
    const t = tarea({
      evidencias: [{ nombre: 'foto.jpg', url: '/u/foto.jpg' }],
    });
    const [r] = planificar(
      [
        filaDe(t, {
          ...completar,
          fechaCumplimientoEfectiva: new Date('2026-11-05T00:00:00Z'),
        }),
      ],
      [t],
    );
    expect(r.resultado).toBe('actualiza');
    expect(r.pasos.map((p) => p.estado)).toEqual(['en-progreso', 'cerrado']);
    expect(r.avisos.join(' ')).toMatch(/dos pasos/);
  });

  it('sin evidencia no se cierra: se sube en el sistema', () => {
    const t = tarea({ ...completar, estado: 'en-progreso' });
    const [r] = planificar(
      [
        filaDe(t, {
          responsableAreaCierre: 'Aguayo Rojas Victor Hugo',
          fechaCumplimientoEfectiva: new Date('2026-11-05T00:00:00Z'),
        }),
      ],
      [t],
    );
    expect(r.resultado).toBe('rechazada');
    expect(r.motivo).toMatch(/evidencia.*se suben en el sistema/);
    expect(r.pasos).toEqual([]);
  });

  it('si la tarea cambió después de bajar la planilla, choca', () => {
    const t = tarea();
    const [r] = planificar([filaDe(t, { ...completar, version: 0 })], [t]);
    expect(r.resultado).toBe('conflicto');
    expect(r.motivo).toMatch(/cambió en el sistema.*eliodoro/);
  });

  it('el hallazgo no se cambia desde la planilla: avisa y aplica lo demás', () => {
    const t = tarea();
    const solo = planificar(
      [filaDe(t, { descripcionObservacion: 'Otra cosa' })],
      [t],
    )[0];
    expect(solo.resultado).toBe('sin-cambios');
    expect(solo.avisos[0]).toMatch(/la descripción.*Corregir tarea/);

    const conMas = planificar(
      [filaDe(t, { ...completar, empresa: 'Otra' })],
      [t],
    )[0];
    expect(conMas.resultado).toBe('actualiza');
    expect(conMas.pasos[0]).not.toHaveProperty('empresa');
    expect(conMas.avisos[0]).toMatch(/la empresa/);
  });

  it('un responsable que no es del sistema rechaza la fila y sugiere', () => {
    const t = tarea();
    const [r] = planificar(
      [
        filaDe(t, {
          ...completar,
          responsableAreaCierre: 'Saul Balladares Rocha',
        }),
      ],
      [t],
    );
    expect(r.resultado).toBe('rechazada');
    expect(r.motivo).toMatch(/¿quiso decir «Balladares Rocha Saúl Ramiro»\?/);
  });

  it('una tarea cerrada sin fecha efectiva no se reabre desde la planilla', () => {
    const t = tarea({
      ...completar,
      responsableAreaCierre: 'Aguayo Rojas Victor Hugo',
      estado: 'cerrado',
      fechaCumplimientoEfectiva: new Date('2026-11-01T00:00:00Z'),
      evidencias: [{ nombre: 'f', url: '/f' }],
    });
    const [r] = planificar(
      [filaDe(t, { fechaCumplimientoEfectiva: undefined })],
      [t],
    );
    expect(r.resultado).toBe('rechazada');
    expect(r.motivo).toMatch(/Corregir tarea/);
  });

  it('aprobada no se toca; fecha ilegible se rechaza', () => {
    const aprobada = tarea({ _id: 'a', aprobado: true });
    const otra = tarea({ _id: 'b' });
    const [ra, rb] = planificar(
      [
        filaDe(aprobada, completar),
        filaDe(otra, { fila: 13, fechaCumplimientoAcordada: null }),
      ],
      [aprobada, otra],
    );
    expect(ra.resultado).toBe('ignorada');
    expect(rb.resultado).toBe('rechazada');
    expect(rb.motivo).toMatch(/fecha acordada \(columna M\)/);
  });

  it('filas sin tarea, repetidas o de tareas dadas de baja', () => {
    const t = tarea();
    const baja = tarea({ _id: 'x', activo: false });
    const resultado = planificar(
      [
        { fila: 20, tieneDatos: true, accionPropuesta: 'Nueva tarea' },
        { fila: 21, tieneDatos: false },
        filaDe(t, { fila: 12 }),
        filaDe(t, { fila: 15 }),
        filaDe(baja, { fila: 16 }),
      ],
      [t, baja],
    );
    expect(resultado.map((r) => [r.fila, r.resultado])).toEqual([
      [20, 'ignorada'],
      [12, 'sin-cambios'],
      [15, 'rechazada'],
      [16, 'rechazada'],
    ]);
    expect(resultado[2].motivo).toMatch(/fila 12/);
  });
});
