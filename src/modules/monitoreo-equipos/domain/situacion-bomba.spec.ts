import {
  compararUrgencia,
  diasEntre,
  situacionDeBomba,
  UltimoReporte,
} from './situacion-bomba';

const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));
const HOY = dia(2026, 10, 15);

/** COTEM137: emitido el 06-oct-26. */
const COTEM137: UltimoReporte = {
  id: '1',
  codigo_interno: 'COTEM-0137',
  fecha: dia(2026, 10, 6),
  resultado: 'NORMAL',
};

describe('situación de una bomba', () => {
  it('los días se cuentan por fecha, no por horas', () => {
    expect(
      diasEntre(dia(2026, 10, 15), new Date(Date.UTC(2026, 10, 10, 16))),
    ).toBe(26);
    expect(diasEntre(dia(2026, 10, 15), dia(2026, 10, 15))).toBe(0);
    expect(diasEntre(dia(2026, 10, 15), dia(2026, 10, 14))).toBe(-1);
  });

  it('230PP013: próximo monitoreo a los 28 días del último reporte', () => {
    const s = situacionDeBomba(COTEM137, 28, HOY);
    expect(s.proximo_monitoreo).toEqual(dia(2026, 11, 3));
    expect(s.dias_para_monitoreo).toBe(19);
    expect(s).toMatchObject({ alerta_monitoreo: 'al_dia', alerta: 'al_dia' });
  });

  it('ya no hay fecha tentativa ni alerta de intervención (se quitó el TMEF)', () => {
    const s = situacionDeBomba(COTEM137, 28, HOY) as unknown as Record<
      string,
      unknown
    >;
    expect(s).not.toHaveProperty('alerta_intervencion');
    expect(s).not.toHaveProperty('dias_para_intervencion');
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

  it('sin reportes emitidos o sin frecuencia no hay fechas que inventar', () => {
    expect(situacionDeBomba(undefined, 28, HOY)).toMatchObject({
      alerta: 'sin_datos',
      proximo_monitoreo: undefined,
    });
    expect(situacionDeBomba(COTEM137, undefined, HOY).alerta).toBe('sin_datos');
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
