import {
  cambiosDeTarea,
  faltantesParaEstado,
  mensajeDeFaltantes,
  type TareaConRequisitos,
} from './requisitos-tarea';

const HOY = new Date(2026, 9, 22);

const programada = (
  extra: Partial<TareaConRequisitos> = {},
): TareaConRequisitos => ({
  familiaPeligro: 'Sustancias peligrosas',
  accionPropuesta: 'Rotular los bidones según la hoja SDS',
  responsableAreaCierre: 'Jhonny Eugenio',
  fechaHallazgo: new Date(2026, 9, 20),
  fechaCumplimientoAcordada: new Date(2026, 9, 30),
  ...extra,
});

describe('faltantesParaEstado', () => {
  it('abierto no exige nada', () => {
    expect(faltantesParaEstado({}, 'abierto', HOY)).toEqual([]);
  });

  it('una tarea programada puede pasar a en progreso', () => {
    expect(faltantesParaEstado(programada(), 'en-progreso', HOY)).toEqual([]);
  });

  it('una accion de pocas letras no alcanza', () => {
    expect(
      faltantesParaEstado(
        programada({ accionPropuesta: 'ok' }),
        'en-progreso',
        HOY,
      ),
    ).toEqual(['una acción propuesta más completa (al menos 10 caracteres)']);
  });

  it('la fecha acordada no puede ser anterior al hallazgo', () => {
    const faltan = faltantesParaEstado(
      programada({ fechaCumplimientoAcordada: new Date(2026, 9, 1) }),
      'en-progreso',
      HOY,
    );
    expect(faltan).toEqual([
      'una fecha acordada que no sea anterior al hallazgo',
    ]);
  });

  it('cerrar exige fecha efectiva y evidencia', () => {
    expect(faltantesParaEstado(programada(), 'cerrado', HOY)).toEqual([
      'la fecha de cumplimiento efectiva',
      'al menos una evidencia del cierre',
    ]);
  });

  it('la fecha efectiva no puede ser futura', () => {
    const faltan = faltantesParaEstado(
      programada({
        fechaCumplimientoEfectiva: new Date(2026, 10, 5),
        evidencias: [{ nombre: 'foto.jpg', url: '/uploads/foto.jpg' }],
      }),
      'cerrado',
      HOY,
    );
    expect(faltan).toEqual(['una fecha efectiva que no sea futura']);
  });

  it('con fecha efectiva de hoy y una evidencia, cierra', () => {
    expect(
      faltantesParaEstado(
        programada({
          fechaCumplimientoEfectiva: HOY,
          evidencias: [{ nombre: 'foto.jpg', url: '/uploads/foto.jpg' }],
        }),
        'cerrado',
        HOY,
      ),
    ).toEqual([]);
  });

  it('el mensaje nombra el estado y lo que falta', () => {
    expect(mensajeDeFaltantes('cerrado', ['a', 'b'])).toBe(
      'Para pasar a Cerrado falta: a; b.',
    );
  });
});

describe('cambiosDeTarea', () => {
  it('registra solo lo que cambio, en texto legible', () => {
    const cambios = cambiosDeTarea(
      {
        estado: 'cerrado',
        accionPropuesta: 'Rotular',
        fechaCumplimientoAcordada: new Date('2026-10-30T00:00:00Z'),
      },
      {
        estado: 'en-progreso',
        accionPropuesta: 'Rotular',
        fechaCumplimientoAcordada: '2026-11-15T00:00:00.000Z',
      },
    );

    expect(cambios).toEqual([
      { campo: 'estado', antes: 'cerrado', despues: 'en-progreso' },
      {
        campo: 'fechaCumplimientoAcordada',
        antes: '2026-10-30',
        despues: '2026-11-15',
      },
    ]);
  });

  it('un campo que no viene en la actualizacion no cuenta como cambio', () => {
    expect(cambiosDeTarea({ accionPropuesta: 'x' }, {})).toEqual([]);
  });
});
