import {
  conResponsablesDeCierre,
  usuariosDeCierre,
} from './responsables-cierre';

describe('responsables de cierre', () => {
  it('una tarea de antes, con un solo usuario, lo tiene como lista', () => {
    expect(
      usuariosDeCierre({ responsableAreaCierreUsername: 'jperez' }),
    ).toEqual(['jperez']);
    expect(usuariosDeCierre({})).toEqual([]);
  });

  it('con lista, la lista manda', () => {
    expect(
      usuariosDeCierre({
        responsableAreaCierreUsername: 'jperez',
        responsablesAreaCierreUsernames: ['jperez', 'mlopez'],
      }),
    ).toEqual(['jperez', 'mlopez']);
  });

  it('limpia la lista y deja el primero en el campo de uno solo', () => {
    expect(
      conResponsablesDeCierre({
        responsablesAreaCierreUsernames: [' mlopez', '', 'jperez', 'mlopez'],
      }),
    ).toEqual({
      responsablesAreaCierreUsernames: ['mlopez', 'jperez'],
      responsableAreaCierreUsername: 'mlopez',
    });
  });

  it('una lista vacía también vacía el campo de uno solo', () => {
    expect(
      conResponsablesDeCierre({
        responsableAreaCierreUsername: 'jperez',
        responsablesAreaCierreUsernames: [],
      }).responsableAreaCierreUsername,
    ).toBe('');
  });

  it('sin lista no toca nada', () => {
    const cambios = { responsableAreaCierreUsername: 'jperez' };
    expect(conResponsablesDeCierre(cambios)).toBe(cambios);
  });
});
