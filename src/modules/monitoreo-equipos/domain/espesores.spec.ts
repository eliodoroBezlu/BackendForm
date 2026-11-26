import { ESTRUCTURA_250SA225 } from '../__pruebas__/medicion-250sa225';
import {
  bajoAlerta,
  erroresDeEstructura,
  erroresDeValores,
  EstructuraDeMedicion,
  hayMediciones,
  letraDePunto,
  minimosAnteriores,
  minimosPorZona,
  normalizarEstructura,
  valoresVacios,
} from './espesores';

const SIMPLE: EstructuraDeMedicion = {
  titulo: 'Medición',
  piezas: [
    {
      nombre: '1',
      zonas: [
        { nombre: 'Lado Oeste', anillos: 2, puntos: 3 },
        { nombre: 'Lado Este', anillos: 1, puntos: 2 },
      ],
      espesor_alerta_mm: 5.5,
    },
  ],
};

describe('Medición de espesores', () => {
  it('la grilla de 250SA225 es válida', () => {
    expect(erroresDeEstructura(ESTRUCTURA_250SA225)).toEqual([]);
  });

  it('una grilla sin piezas, con nombres repetidos o tamaños fuera de rango no sirve', () => {
    expect(erroresDeEstructura({ titulo: '', piezas: [] })).toEqual([
      'Falta el título de la medición',
      'La medición necesita al menos una pieza',
    ]);
    const errores = erroresDeEstructura({
      titulo: 'X',
      piezas: [
        {
          nombre: 'A',
          zonas: [
            { nombre: 'Lado Sur', anillos: 0, puntos: 13 },
            { nombre: 'lado  sur', anillos: 1, puntos: 1 },
          ],
        },
        { nombre: ' a ', zonas: [], espesor_nominal_mm: -1 },
      ],
    });
    expect(errores).toEqual([
      'La pieza «A», la zona «Lado Sur»: de 1 a 12 anillos',
      'La pieza «A», la zona «Lado Sur»: de 1 a 12 puntos',
      'La pieza «A»: la zona «lado  sur» está repetida',
      'La pieza «a» está repetida',
      'La pieza «a»: el espesor nominal no es válido',
      'La pieza «a» no tiene zonas',
    ]);
  });

  it('con varias zonas, cada una lleva nombre; con una sola, no hace falta', () => {
    expect(
      erroresDeEstructura({
        titulo: 'X',
        piezas: [
          {
            nombre: '1',
            zonas: [
              { nombre: '', anillos: 1, puntos: 1 },
              { nombre: 'Lado Sur', anillos: 1, puntos: 1 },
            ],
          },
        ],
      }),
    ).toEqual(['La pieza «1»: la zona 1 no tiene nombre']);
  });

  it('normalizar quita espacios y no deja claves vacías', () => {
    const n = normalizarEstructura({
      titulo: ' T ',
      piezas: [
        { nombre: ' 1 ', zonas: [{ nombre: ' Sur ', anillos: 1, puntos: 2 }] },
      ],
    });
    expect(n).toEqual({
      titulo: 'T',
      piezas: [
        { nombre: '1', zonas: [{ nombre: 'Sur', anillos: 1, puntos: 2 }] },
      ],
    });
  });

  it('la grilla vacía tiene la forma exacta de la plantilla', () => {
    expect(valoresVacios(SIMPLE)).toEqual([
      [
        [
          [null, null, null],
          [null, null, null],
        ],
        [[null, null]],
      ],
    ]);
    expect(erroresDeValores(SIMPLE, valoresVacios(SIMPLE))).toEqual([]);
    expect(
      erroresDeValores(ESTRUCTURA_250SA225, valoresVacios(ESTRUCTURA_250SA225)),
    ).toEqual([]);
  });

  it('valores con otra forma o espesores imposibles se rechazan', () => {
    const forma = ['Las mediciones no calzan con la grilla de la plantilla'];
    expect(erroresDeValores(SIMPLE, 'x')).toEqual(forma);
    expect(erroresDeValores(SIMPLE, [[[[1, 2, 3]], [[1, 2]]]])).toEqual(forma);
    expect(
      erroresDeValores(SIMPLE, [
        [
          [
            [6.1, -1, null],
            [6, 6, 600],
          ],
          [[6, 'x']],
        ],
      ]),
    ).toEqual([
      'Pieza 1, Lado Oeste, anillo 1, punto B: el espesor no es válido',
      'Pieza 1, Lado Oeste, anillo 2, punto C: el espesor no es válido',
      'Pieza 1, Lado Este, anillo 1, punto B: el espesor no es válido',
    ]);
  });

  it('el mínimo es por zona y una zona sin medir no tiene mínimo', () => {
    const valores = [
      [
        [
          [6.32, 5.98, null],
          [6.47, 5.69, 6.01],
        ],
        [[null, null]],
      ],
    ];
    expect(minimosPorZona(SIMPLE, valores)).toEqual([
      { pieza: '1', zona: 'Lado Oeste', minimo: 5.69 },
      { pieza: '1', zona: 'Lado Este', minimo: undefined },
    ]);
    expect(hayMediciones(valores)).toBe(true);
    expect(hayMediciones(valoresVacios(SIMPLE))).toBe(false);
  });

  it('la alerta es estrictamente por debajo del espesor de alerta', () => {
    const p = SIMPLE.piezas[0];
    expect(bajoAlerta(p, 5.49)).toBe(true);
    expect(bajoAlerta(p, 5.5)).toBe(false);
    expect(bajoAlerta(p, undefined)).toBe(false);
    expect(bajoAlerta({ nombre: 'x', zonas: [] }, 1)).toBe(false);
  });

  it('el anterior se busca por pieza y zona, sin importar mayúsculas ni espacios', () => {
    expect(
      minimosAnteriores(SIMPLE, [
        { pieza: '1', zona: 'lado  oeste', minimo: 5.8 },
        { pieza: '2', zona: 'Lado Este', minimo: 4 },
      ]),
    ).toEqual([[5.8, undefined]]);
  });

  it('los puntos se nombran con letras', () => {
    expect([0, 1, 7].map(letraDePunto)).toEqual(['A', 'B', 'H']);
  });
});
