import {
  CAMPOS_BLOQUEADOS_DESDE_INSPECCION,
  validarActualizacionTarea,
  type TareaActualLike,
} from './tarea-update.validation';

const tareaBase = (extra: Partial<TareaActualLike> = {}): TareaActualLike => ({
  aprobado: false,
  estado: 'abierto',
  ...extra,
});

/** Tarea con todo lo que exige el paso a «en-progreso». */
const tareaCompleta = (extra: Partial<TareaActualLike> = {}) =>
  tareaBase({
    familiaPeligro: 'Caida de altura',
    accionPropuesta: 'Instalar linea de vida',
    responsableAreaCierre: 'jperez',
    fechaCumplimientoAcordada: new Date(2026, 0, 20),
    ...extra,
  });

describe('validarActualizacionTarea — bloqueos', () => {
  it('una tarea aprobada ya no se edita', () => {
    const { error } = validarActualizacionTarea(tareaBase({ aprobado: true }), {
      estado: 'cerrado',
    });

    expect(error?.type).toBe('aprobada');
  });

  it('en una tarea venida de inspeccion no se tocan los campos del hallazgo', () => {
    const { error } = validarActualizacionTarea(
      tareaBase({ instanceId: 'inst-1' }),
      { descripcionObservacion: 'otra cosa' } as never,
    );

    expect(error?.type).toBe('campos-bloqueados');
    // El mensaje enumera los campos para que el usuario sepa cuales son.
    CAMPOS_BLOQUEADOS_DESDE_INSPECCION.forEach((campo) => {
      expect(error?.message).toContain(campo);
    });
  });

  it('esos mismos campos SI se editan en una tarea creada a mano', () => {
    const { error } = validarActualizacionTarea(tareaBase(), {
      descripcionObservacion: 'otra cosa',
    } as never);

    expect(error).toBeUndefined();
  });
});

describe('validarActualizacionTarea — transiciones de estado', () => {
  it('no se pasa a en-progreso sin los cuatro datos obligatorios', () => {
    const { error } = validarActualizacionTarea(tareaBase(), {
      estado: 'en-progreso',
    });

    expect(error?.type).toBe('en-progreso-incompleto');
  });

  it('con los cuatro datos, la transicion pasa', () => {
    const { error } = validarActualizacionTarea(tareaCompleta(), {
      estado: 'en-progreso',
    });

    expect(error).toBeUndefined();
  });

  it('los datos que faltan pueden llegar en la misma actualizacion', () => {
    // La validacion mira la tarea YA con los cambios aplicados, no la
    // anterior: si no, seria imposible completar y avanzar de una vez.
    const { error } = validarActualizacionTarea(
      tareaBase({
        familiaPeligro: 'Caida',
        accionPropuesta: 'Linea de vida',
        responsableAreaCierre: 'jperez',
      }),
      { estado: 'en-progreso', fechaCumplimientoAcordada: '2026-01-20' },
    );

    expect(error).toBeUndefined();
  });

  it('no se cierra una tarea sin fecha efectiva ni evidencia', () => {
    const { error } = validarActualizacionTarea(
      tareaCompleta({ estado: 'en-progreso' }),
      { estado: 'cerrado' },
    );

    expect(error?.type).toBe('cerrado-incompleto');
    expect(error?.message).toContain('fecha de cumplimiento efectiva');
    expect(error?.message).toContain('evidencia');
  });

  it('se cierra si la fecha efectiva y la evidencia llegan en la propia actualizacion', () => {
    const { error } = validarActualizacionTarea(
      tareaCompleta({ estado: 'en-progreso' }),
      {
        estado: 'cerrado',
        fechaCumplimientoEfectiva: '2026-01-22',
        evidencias: [{ nombre: 'foto.jpg', url: '/uploads/foto.jpg' }],
      },
    );

    expect(error).toBeUndefined();
  });

  it('no se salta de abierto a cerrado', () => {
    const { error } = validarActualizacionTarea(tareaCompleta(), {
      estado: 'cerrado',
      fechaCumplimientoEfectiva: '2026-01-22',
      evidencias: [{ nombre: 'foto.jpg', url: '/uploads/foto.jpg' }],
    });

    expect(error?.type).toBe('salto');
  });

  it('por esta via no se vuelve atras: eso es una correccion del admin', () => {
    const { error } = validarActualizacionTarea(
      tareaCompleta({ estado: 'en-progreso' }),
      { estado: 'abierto' },
    );

    expect(error?.type).toBe('retroceso');
  });

  it('una accion propuesta de pocas letras no pasa a en progreso', () => {
    const { error } = validarActualizacionTarea(
      tareaCompleta({ accionPropuesta: 'ok' }),
      { estado: 'en-progreso' },
    );

    expect(error?.type).toBe('en-progreso-incompleto');
  });

  it('aprobar no se cuela por la edicion', () => {
    const { actualizacionProcesada } = validarActualizacionTarea(
      tareaCompleta(),
      { aprobado: true } as never,
    );

    expect(actualizacionProcesada).not.toHaveProperty('aprobado');
  });
});

describe('validarActualizacionTarea — normalizacion', () => {
  it('convierte las fechas de texto a Date', () => {
    const { actualizacionProcesada } = validarActualizacionTarea(
      tareaCompleta(),
      {
        fechaCumplimientoAcordada: '2026-01-20',
        fechaCumplimientoEfectiva: '2026-01-22',
      },
    );

    expect(actualizacionProcesada.fechaCumplimientoAcordada).toBeInstanceOf(
      Date,
    );
    expect(actualizacionProcesada.fechaCumplimientoEfectiva).toBeInstanceOf(
      Date,
    );
  });

  it('descarta las evidencias incompletas y recorta los espacios', () => {
    const { actualizacionProcesada } = validarActualizacionTarea(tareaBase(), {
      evidencias: [
        { nombre: '  foto.jpg  ', url: '  /uploads/foto.jpg  ' },
        { nombre: 'sin-url' },
        { url: '/uploads/sin-nombre.jpg' },
      ],
    });

    expect(actualizacionProcesada.evidencias).toEqual([
      { nombre: 'foto.jpg', url: '/uploads/foto.jpg' },
    ]);
  });

  it('una lista vacia de evidencias significa borrarlas todas', () => {
    const { actualizacionProcesada } = validarActualizacionTarea(tareaBase(), {
      evidencias: [],
    });

    expect(actualizacionProcesada.evidencias).toEqual([]);
  });

  it('si no se mencionan las evidencias, no se tocan', () => {
    const { actualizacionProcesada } = validarActualizacionTarea(tareaBase(), {
      estado: 'abierto',
    });

    expect('evidencias' in actualizacionProcesada).toBe(false);
  });
});
