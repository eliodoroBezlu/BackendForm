import {
  compararUrgencia,
  diasEntre,
  situacionDeBomba,
  UltimoReporte,
} from './situacion-bomba';

const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));
const HOY = dia(2026, 10, 15);

/** COTEM137: 06-oct-26, fecha tentativa 10-nov-26 (856 h después). */
const COTEM137: UltimoReporte = {
  id: '1',
  codigo_interno: 'COTEM-0137',
  fecha: dia(2026, 10, 6),
  resultado: 'NORMAL',
  fecha_tentativa: new Date(Date.UTC(2026, 10, 10, 16)),
  horas_restantes: 856,
};

describe('situación de una bomba', () => {
  it('los días se cuentan por fecha, no por horas', () => {
    expect(
      diasEntre(dia(2026, 10, 15), new Date(Date.UTC(2026, 10, 10, 16))),
    ).toBe(26);
    expect(diasEntre(dia(2026, 10, 15), dia(2026, 10, 15))).toBe(0);
    expect(diasEntre(dia(2026, 10, 15), dia(2026, 10, 14))).toBe(-1);
  });

  it('230PP013: próximo monitoreo a los 28 días del último reporte, intervención al día', () => {
    const s = situacionDeBomba(COTEM137, 28, HOY);
    expect(s.proximo_monitoreo).toEqual(dia(2026, 11, 3));
    expect(s.dias_para_monitoreo).toBe(19);
    expect(s.dias_para_intervencion).toBe(26);
    expect(s).toMatchObject({
      alerta_monitoreo: 'al_dia',
      alerta_intervencion: 'al_dia',
      alerta: 'al_dia',
    });
  });

  it('el monitoreo pasa a próximo una semana antes y a vencido al día siguiente', () => {
    expect(
      situacionDeBomba(COTEM137, 28, dia(2026, 10, 27)).alerta_monitoreo,
    ).toBe('proxima');
    expect(
      situacionDeBomba(COTEM137, 28, dia(2026, 11, 3)).alerta_monitoreo,
    ).toBe('proxima');
    expect(
      situacionDeBomba(COTEM137, 28, dia(2026, 11, 4)).alerta_monitoreo,
    ).toBe('vencida');
  });

  it('la intervención avisa con dos semanas, porque se planifica en JDE', () => {
    expect(
      situacionDeBomba(COTEM137, 70, dia(2026, 10, 27)).alerta_intervencion,
    ).toBe('proxima');
    expect(
      situacionDeBomba(COTEM137, 70, dia(2026, 10, 26)).alerta_intervencion,
    ).toBe('al_dia');
  });

  it('la alerta general es la peor de las dos', () => {
    // Monitoreo al día (70 días) pero la intervención ya pasó.
    const s = situacionDeBomba(COTEM137, 70, dia(2026, 11, 20));
    expect(s.alerta_monitoreo).toBe('al_dia');
    expect(s.alerta_intervencion).toBe('vencida');
    expect(s.alerta).toBe('vencida');
  });

  it('sin reportes emitidos no hay fechas que inventar', () => {
    expect(situacionDeBomba(undefined, 28, HOY)).toMatchObject({
      alerta: 'sin_datos',
      proximo_monitoreo: undefined,
    });
    // Sin TMEF en la ficha no hay fecha tentativa, pero sí próximo monitoreo.
    const sinTmef = situacionDeBomba(
      { ...COTEM137, fecha_tentativa: undefined },
      28,
      HOY,
    );
    expect(sinTmef).toMatchObject({
      alerta_intervencion: 'sin_datos',
      alerta: 'al_dia',
    });
  });

  it('ordena lo vencido primero y, dentro de cada grupo, lo más cercano', () => {
    const vencida = situacionDeBomba(COTEM137, 28, dia(2026, 12, 1));
    const cerca = situacionDeBomba(COTEM137, 28, dia(2026, 11, 1));
    const lejos = situacionDeBomba(COTEM137, 70, HOY);
    const nada = situacionDeBomba(undefined, 28, HOY);
    expect([nada, lejos, cerca, vencida].sort(compararUrgencia)).toEqual([
      vencida,
      cerca,
      lejos,
      nada,
    ]);
  });
});
