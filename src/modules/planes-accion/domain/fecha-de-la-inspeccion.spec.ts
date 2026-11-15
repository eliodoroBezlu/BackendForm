import { fechaDeLaInspeccion } from './fecha-de-la-inspeccion';

describe('fechaDeLaInspeccion', () => {
  it('toma «Fecha inspección» en cualquiera de sus nombres, como día de Bolivia', () => {
    expect(
      fechaDeLaInspeccion({
        Supervisor: 'x',
        'Fecha inspección (yyyy-mm-aa)': '2026-02-27T04:00:00.000Z',
      }),
    ).toBe('2026-02-27');
    expect(
      fechaDeLaInspeccion({ 'Fecha Inspección': '2025-10-18T04:00:00.000Z' }),
    ).toBe('2025-10-18');
  });

  it('no corre el día: la medianoche de Bolivia sigue siendo ese día', () => {
    expect(
      fechaDeLaInspeccion({ 'Fecha inspección': '2026-10-21T03:59:00.000Z' }),
    ).toBe('2026-10-20');
    expect(fechaDeLaInspeccion({ 'Fecha inspección': '2026-10-21' })).toBe(
      '2026-10-21',
    );
  });

  it('acepta el Map de Mongoose', () => {
    expect(
      fechaDeLaInspeccion(
        new Map([['Fecha inspección', '2026-10-21T04:00:00.000Z']]),
      ),
    ).toBe('2026-10-21');
  });

  it('sin el dato o con basura, usa el día en que se registró', () => {
    const registrada = new Date('2025-11-12T15:00:00.000Z');
    expect(fechaDeLaInspeccion({ Lugar: 'Filtros' }, registrada)).toBe(
      '2025-11-12',
    );
    expect(
      fechaDeLaInspeccion({ 'Fecha inspección': 'no sé' }, registrada),
    ).toBe('2025-11-12');
    expect(fechaDeLaInspeccion(undefined)).toBeUndefined();
  });
});
