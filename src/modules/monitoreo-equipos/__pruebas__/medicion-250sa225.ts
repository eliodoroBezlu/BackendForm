import { EstructuraDeMedicion } from '../domain/espesores';

/**
 * La grilla del reporte COULT-0482 (250SA225, 12-nov-26): la celda 250FT282,
 * el dardo LV250033 y el muestreador con su cuello y sus seis piezas.
 */
export const ESTRUCTURA_250SA225: EstructuraDeMedicion = {
  titulo:
    'Ultrasonido, celda Scavenger 250-FT-282, válvula dardo y muestreador',
  piezas: [
    {
      nombre: '250FT282',
      zonas: [{ nombre: '', anillos: 4, puntos: 8 }],
      espesor_nominal_mm: 6.5,
      espesor_alerta_mm: 5.5,
    },
    {
      nombre: 'Cuello 250FT282',
      zonas: [{ nombre: '', anillos: 1, puntos: 8 }],
    },
    {
      nombre: 'Dardo LV250033',
      zonas: [{ nombre: '', anillos: 4, puntos: 8 }],
    },
    { nombre: 'Cuello', zonas: [{ nombre: '', anillos: 1, puntos: 8 }] },
    {
      nombre: '1',
      zonas: [
        { nombre: 'Lado Oeste', anillos: 4, puntos: 8 },
        { nombre: 'Lado inferior', anillos: 5, puntos: 6 },
        { nombre: 'Lado Este', anillos: 4, puntos: 8 },
      ],
      espesor_nominal_mm: 6.5,
      espesor_alerta_mm: 5.5,
    },
    {
      nombre: '2',
      zonas: [
        { nombre: 'Lado Oeste', anillos: 3, puntos: 8 },
        { nombre: 'Lado Sur', anillos: 3, puntos: 8 },
        { nombre: 'Lado Este', anillos: 3, puntos: 8 },
      ],
      espesor_nominal_mm: 6.5,
      espesor_alerta_mm: 5.5,
    },
    {
      nombre: '3',
      zonas: [
        { nombre: 'Lado Oeste', anillos: 3, puntos: 5 },
        { nombre: 'Lado Sur', anillos: 3, puntos: 5 },
        { nombre: 'Lado Este', anillos: 3, puntos: 5 },
        { nombre: 'Lado Norte', anillos: 3, puntos: 5 },
      ],
      espesor_nominal_mm: 6.5,
      espesor_alerta_mm: 5.5,
    },
    { nombre: '4', zonas: [{ nombre: '', anillos: 1, puntos: 8 }] },
    { nombre: '5', zonas: [{ nombre: '', anillos: 2, puntos: 8 }] },
    {
      nombre: '6',
      zonas: [{ nombre: '', anillos: 2, puntos: 8 }],
      espesor_nominal_mm: 6.5,
      espesor_alerta_mm: 5.5,
    },
  ],
};
