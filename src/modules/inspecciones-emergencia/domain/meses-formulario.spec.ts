import {
  esMesValido,
  mesesGuardados,
  mesesQueFaltan,
  periodoDeMes,
  ultimoMes,
} from './meses-formulario';

describe('meses de un formulario de emergencia', () => {
  it('cada mes pertenece a su semestre', () => {
    expect(periodoDeMes('JUNIO')).toBe('ENERO-JUNIO');
    expect(periodoDeMes('JULIO')).toBe('JULIO-DICIEMBRE');
    expect(esMesValido('AGOSTO')).toBe(true);
    expect(esMesValido('agosto')).toBe(false);
  });

  it('el caso de agosto: el envío trae julio (ya guardado) y agosto (nuevo)', () => {
    const enviados = { JULIO: { x: 1 }, AGOSTO: { x: 2 } };
    expect(mesesQueFaltan(['JULIO'], enviados, 'JULIO-DICIEMBRE')).toEqual([
      'AGOSTO',
    ]);
  });

  it('no pisa meses guardados ni acepta meses de otro semestre', () => {
    const enviados = { MARZO: {}, JULIO: {}, SEPTIEMBRE: {} };
    expect(
      mesesQueFaltan(['JULIO', 'SEPTIEMBRE'], enviados, 'JULIO-DICIEMBRE'),
    ).toEqual([]);
    expect(mesesQueFaltan([], undefined, 'ENERO-JUNIO')).toEqual([]);
  });

  it('último mes y meses guardados (Map de Mongoose u objeto)', () => {
    expect(ultimoMes(['JULIO', 'NOVIEMBRE', 'AGOSTO'])).toBe('NOVIEMBRE');
    expect(ultimoMes(['otro'])).toBeNull();
    expect(
      mesesGuardados(
        new Map([
          ['JULIO', 1],
          ['AGOSTO', 2],
        ]),
      ),
    ).toEqual(['JULIO', 'AGOSTO']);
    expect(mesesGuardados({ MAYO: 1 })).toEqual(['MAYO']);
    expect(mesesGuardados(undefined)).toEqual([]);
  });
});
