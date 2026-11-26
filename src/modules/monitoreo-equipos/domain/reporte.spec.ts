import {
  armarAntecedentes,
  codigoInterno,
  faltantesParaEnviar,
  horasDePieza,
} from './reporte';

const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));

describe('reporte de monitoreo — dominio', () => {
  it('el código interno es la técnica y el correlativo a 4 cifras', () => {
    expect(codigoInterno('COTEM', 137)).toBe('COTEM-0137');
    expect(codigoInterno('COTEM', 9)).toBe('COTEM-0009');
  });

  describe('armarAntecedentes', () => {
    // COTEM137: 230PP013, 06-oct-26, 2044 horas.
    const entrada = {
      ahora: dia(2026, 10, 6),
      fecha: dia(2026, 10, 6),
      horas: 2044,
      ficha: { modelo: 'WARMAN ASH 550 MMC', alcance: 'Monitoreo de desgaste' },
      componentes: [
        {
          pieza: 'Voluta',
          proveedor: 'ALTONA',
          material: '068 LC',
          dureza_hb: 600,
          fecha_instalacion: dia(2026, 6, 28),
        },
      ],
      intervenciones: [
        {
          fecha: dia(2026, 6, 28),
          tipo: 'Cambio de piezas',
          piezas: ['Voluta'],
        },
        { fecha: dia(2026, 11, 1), tipo: 'Mantenimiento', piezas: [] },
      ],
    };

    it('ya no calcula TMEF, horas restantes ni fecha tentativa', () => {
      const a = armarAntecedentes(entrada) as unknown as Record<
        string,
        unknown
      >;
      expect(a).not.toHaveProperty('horas_restantes');
      expect(a).not.toHaveProperty('fecha_tentativa');
    });

    it('la última intervención es la más reciente hasta la fecha del reporte', () => {
      expect(armarAntecedentes(entrada).ultima_intervencion?.fecha).toEqual(
        dia(2026, 6, 28),
      );
    });

    it('las piezas montadas en la última intervención llevan las horas del día', () => {
      expect(armarAntecedentes(entrada).componentes[0].horas_trabajo).toBe(
        2044,
      );
    });

    describe('piezas completadas en el reporte', () => {
      it('lo escrito manda; lo vacío y lo que el reporte no pide salen de la ficha', () => {
        const [voluta] = armarAntecedentes({
          ...entrada,
          piezasDelReporte: [
            {
              pieza: 'Voluta',
              proveedor: 'WEIR',
              material: '',
              condicion_inicial: 'Nuevo',
            },
          ],
        }).componentes;
        expect(voluta).toMatchObject({
          pieza: 'Voluta',
          proveedor: 'WEIR',
          material: '068 LC', // vacío en el reporte: el de la ficha
          condicion_inicial: 'Nuevo',
          dureza_hb: 600, // el reporte no lo pide: se conserva
          horas_trabajo: 2044,
        });
      });

      it('una pieza sin ficha toma lo del reporte y calcula sus horas', () => {
        const [, impulsor] = armarAntecedentes({
          ...entrada,
          piezasDelReporte: [
            { pieza: 'Voluta' },
            { pieza: 'Impulsor', fecha_instalacion: dia(2026, 6, 28) },
          ],
        }).componentes;
        expect(impulsor).toEqual({
          pieza: 'Impulsor',
          fecha_instalacion: dia(2026, 6, 28),
          horas_trabajo: 2044,
        });
      });

      it('las horas escritas a mano reemplazan a las calculadas', () => {
        const [voluta] = armarAntecedentes({
          ...entrada,
          piezasDelReporte: [{ pieza: 'Voluta', horas_trabajo: 2601 }],
        }).componentes;
        expect(voluta.horas_trabajo).toBe(2601);
      });
    });
  });

  describe('horasDePieza', () => {
    const instalada = dia(2025, 3, 31);
    it('suma los períodos cerrados después de su instalación', () => {
      const intervenciones = [
        { fecha: dia(2025, 3, 31), horas: 5736, piezas: [] },
        { fecha: dia(2025, 8, 20), horas: 3000, piezas: [] },
      ];
      expect(horasDePieza(instalada, intervenciones, 856)).toBe(3856);
    });

    it('si falta una hora del camino, no hay dato', () => {
      const intervenciones = [{ fecha: dia(2025, 8, 20), piezas: [] }];
      expect(horasDePieza(instalada, intervenciones, 856)).toBeUndefined();
    });

    it('sin fecha de instalación no hay dato', () => {
      expect(horasDePieza(undefined, [], 856)).toBeUndefined();
    });
  });

  describe('faltantesParaEnviar', () => {
    const completo = {
      tecnica: 'TERMOGRAFIA MECANICA',
      resultado: 'NORMAL',
      alcance: 'Seguimiento',
      emisividad: 0.95,
      analisis: 'Sin anomalías',
      recomendaciones: [],
      tareas: [],
    };

    it('un reporte sin recomendaciones no necesita tareas', () => {
      expect(faltantesParaEnviar(completo)).toEqual([]);
    });

    it('pide técnica, alcance, emisividad, análisis y resultado', () => {
      expect(
        faltantesParaEnviar({ recomendaciones: [], tareas: [], alcance: '  ' }),
      ).toEqual([
        'La técnica de monitoreo',
        'El alcance',
        'La emisividad',
        'El análisis y diagnóstico',
        'El resultado del análisis',
      ]);
    });

    it('con medición de espesores pide los valores en vez de la emisividad', () => {
      const sinEmisividad = { ...completo, emisividad: undefined };
      expect(
        faltantesParaEnviar({
          ...sinEmisividad,
          medicion: { valores: [[[[null, null]]]] },
        }),
      ).toEqual(['Las mediciones de espesores']);
      expect(
        faltantesParaEnviar({
          ...sinEmisividad,
          medicion: { valores: [[[[6.1, null]]]] },
        }),
      ).toEqual([]);
    });

    it('con recomendaciones, las tareas llevan descripción y con quién se coordinó', () => {
      expect(
        faltantesParaEnviar({
          ...completo,
          recomendaciones: ['Nueva medición'],
        }),
      ).toEqual(['Al menos una tarea, porque hay recomendaciones']);
      expect(
        faltantesParaEnviar({
          ...completo,
          recomendaciones: ['Nueva medición'],
          tareas: [{ descripcion: 'Nueva medición' }],
        }),
      ).toEqual(['Con quién se comunicó o coordinó la tarea 1']);
    });
  });
});
