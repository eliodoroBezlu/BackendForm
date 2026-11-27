import { consultaDelReporte, nombreExacto } from './consulta-reporte';

const FLOT =
  'Superintendencia de Mantenimiento - Mec. Plta. Flot., Filtros, Taller Gral. y RH';
const maestro = [
  { nombre: 'Generacion', superintendencia: FLOT },
  { nombre: 'Filtros', superintendencia: FLOT },
  {
    nombre: 'Chancado',
    superintendencia:
      'Superintendencia de Mantenimiento - Mec. Plta. Chancado, Molienda y Lubricación',
  },
];

describe('consultaDelReporte', () => {
  it('sin filtros trae todo menos las copias archivadas', () => {
    expect(consultaDelReporte({}, maestro)).toEqual({
      estado: { $ne: 'archivado' },
    });
  });

  it('el área se compara entera, escapada y sin mayúsculas', () => {
    const r = nombreExacto('Mec. Plta.');
    expect(r.test('mec. plta. ')).toBe(true);
    expect(r.test('Mecx Plta.')).toBe(false);
    const q = consultaDelReporte({ area: 'Generacion' }, maestro) as {
      $and: [object, { area: RegExp }];
    };
    expect(q.$and[1].area.test('Generacion')).toBe(true);
    expect(q.$and[1].area.test('Generacion 2')).toBe(false);
  });

  it('la superintendencia se resuelve por las áreas del maestro (aunque el formulario guarde el nombre viejo)', () => {
    const q = consultaDelReporte(
      {
        superintendencia:
          'superintendencia de mantenimiento - mec. plta. flot., filtros, taller gral. y rh',
      },
      maestro,
    ) as {
      $and: [
        object,
        {
          $or: [
            { area: { $in: RegExp[] } },
            { area: { $nin: RegExp[] }; superintendencia: RegExp },
          ];
        },
      ];
    };
    const [porArea, porTexto] = q.$and[1].$or;
    expect(porArea.area.$in.map((r) => r.source)).toEqual([
      nombreExacto('Generacion').source,
      nombreExacto('Filtros').source,
    ]);
    // Solo las áreas que el maestro no conoce se comparan por el texto guardado.
    expect(porTexto.area.$nin).toHaveLength(3);
    expect(porTexto.superintendencia.test(FLOT)).toBe(true);
  });

  it('área, superintendencia, mes y año se combinan; un mes inválido se ignora', () => {
    const q = consultaDelReporte(
      {
        area: 'Filtros',
        superintendencia: FLOT,
        mesActual: 'octubre',
        anio: '2026',
      },
      maestro,
    ) as { $and: object[] };
    expect(q.$and).toHaveLength(5);
    expect(q.$and[3]).toEqual({ 'meses.OCTUBRE': { $exists: true } });
    expect(q.$and[4]).toEqual({ año: 2026 });
    expect(consultaDelReporte({ mesActual: '$where' }, maestro)).toEqual({
      estado: { $ne: 'archivado' },
    });
  });
});
