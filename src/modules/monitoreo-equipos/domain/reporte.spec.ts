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
    // COTEM137: 230PP013, 06-oct-26, 2044 horas, TMEF 2900 (celda oculta AO1).
    const entrada = {
      ahora: dia(2026, 10, 6),
      fecha: dia(2026, 10, 6),
      horas: 2044,
      ficha: { tmef_hrs: 2900, modelo: 'WARMAN ASH 550 MMC' },
      componentes: [{ pieza: 'Voluta', fecha_instalacion: dia(2026, 6, 28) }],
      intervenciones: [
        {
          fecha: dia(2026, 6, 28),
          tipo: 'Cambio de piezas',
          piezas: ['Voluta'],
        },
        { fecha: dia(2026, 11, 1), tipo: 'Mantenimiento', piezas: [] },
      ],
    };

    it('la fecha tentativa usa las horas del día, no una celda vacía', () => {
      const a = armarAntecedentes(entrada);
      expect(a.horas_restantes).toBe(856);
      // 856 h = 35 días y 16 h después del 06-oct-26.
      expect(a.fecha_tentativa).toEqual(new Date(Date.UTC(2026, 10, 10, 16)));
    });

    it('la última intervención es la más reciente hasta la fecha del reporte', () => {
      expect(armarAntecedentes(entrada).ultima_intervencion?.fecha).toEqual(
        dia(2026, 6, 28),
      );
    });

    it('sin TMEF o sin horas no inventa la fecha tentativa', () => {
      const a = armarAntecedentes({ ...entrada, horas: undefined });
      expect(a.horas_restantes).toBeUndefined();
      expect(a.fecha_tentativa).toBeUndefined();
    });

    it('las piezas montadas en la última intervención llevan las horas del día', () => {
      expect(armarAntecedentes(entrada).componentes[0].horas_trabajo).toBe(
        2044,
      );
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
      analisis: 'Sin anomalías',
      recomendaciones: [],
      tareas: [],
    };

    it('un reporte sin recomendaciones no necesita tareas', () => {
      expect(faltantesParaEnviar(completo)).toEqual([]);
    });

    it('pide técnica, alcance, análisis y resultado', () => {
      expect(
        faltantesParaEnviar({ recomendaciones: [], tareas: [], alcance: '  ' }),
      ).toEqual([
        'La técnica de monitoreo',
        'El alcance',
        'El análisis y diagnóstico',
        'El resultado del análisis',
      ]);
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
