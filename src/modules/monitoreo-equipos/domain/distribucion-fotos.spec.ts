import {
  distribuirFotos,
  fotosPorFila,
  proporcionDeCaja,
} from './distribucion-fotos';

/**
 * Los mismos casos que `distribucionFotos.test.mjs` del frontend: la vista
 * previa y el PDF tienen que repartir igual.
 */
describe('distribución de fotos (la misma que la vista previa)', () => {
  it('las filas se reparten parejo, las largas primero', () => {
    const casos: Record<number, number[]> = {
      1: [1],
      2: [2],
      3: [3],
      4: [2, 2],
      5: [3, 2],
      6: [3, 3],
      7: [3, 2, 2],
      8: [3, 3, 2],
      9: [3, 3, 3],
    };
    for (const [n, esperado] of Object.entries(casos)) {
      expect(fotosPorFila(Number(n), 3)).toEqual(esperado);
    }
  });

  it('el máximo por fila es configurable', () => {
    expect(fotosPorFila(5, 2)).toEqual([2, 2, 1]);
    expect(fotosPorFila(5, 4)).toEqual([3, 2]);
    expect(fotosPorFila(4, 1)).toEqual([1, 1, 1, 1]);
    expect(fotosPorFila(6, 6)).toEqual([6]);
    expect(fotosPorFila(7, 6)).toEqual([4, 3]);
    expect(fotosPorFila(12, 6)).toEqual([6, 6]);
    expect(fotosPorFila(0, 3)).toEqual([]);
  });

  it('todas las fotos miden lo mismo y una fila corta se centra', () => {
    const d = distribuirFotos(5, 3, 620, 10);
    expect(d.anchoCelda).toBe(200);
    expect(d.filas[0]).toEqual({ indices: [0, 1, 2], desplazamiento: 0 });
    expect(d.filas[1]).toEqual({ indices: [3, 4], desplazamiento: 105 });
  });

  it('una sola foto no ocupa todo el ancho', () => {
    const d = distribuirFotos(1, 3, 620, 10);
    expect(d.columnas).toBe(2);
    expect(d.anchoCelda).toBe(305);
    expect(d.filas[0].desplazamiento).toBe(157.5);
  });

  it('con una por fila, sí ocupa el ancho completo', () => {
    expect(distribuirFotos(2, 1, 620, 10).anchoCelda).toBe(620);
  });

  it('la caja la marca la foto más alta, entre 4:3 apaisada y 3:4 vertical', () => {
    const flirDePie = { ancho: 348, alto: 464 };
    const apaisada = { ancho: 464, alto: 348 };
    expect(proporcionDeCaja([apaisada])).toBe(0.75);
    expect(proporcionDeCaja([apaisada, flirDePie])).toBeCloseTo(4 / 3);
    expect(proporcionDeCaja([{ ancho: 100, alto: 400 }])).toBeCloseTo(4 / 3);
    expect(proporcionDeCaja([{ ancho: 400, alto: 100 }])).toBe(0.75);
    expect(proporcionDeCaja([{}, {}])).toBe(0.75);
  });
});
