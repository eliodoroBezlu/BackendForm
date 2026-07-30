import {
  calcularIndicadores,
  calcularIndicadoresPgr,
  derivarMesesProgramados,
  ProgramacionMesLike,
} from './pgr-kpi.util';

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** Atajo para declarar un mes con sus 4 cantidades. */
const mes = (
  m: number,
  programado: number,
  realMesPasado = 0,
  realDelMes = 0,
  realMesAdelantado = 0,
): ProgramacionMesLike => ({
  mes: m,
  programado,
  realMesPasado,
  realDelMes,
  realMesAdelantado,
});

describe('pgr-kpi.util', () => {
  describe('calcularIndicadores — semántica de las 3 categorías', () => {
    it('cuenta las tres categorías para eficacia', () => {
      const r = calcularIndicadores([mes(1, 3, 1, 1, 1)], 12);
      expect(r.programado).toBe(3);
      expect(r.eficacia).toBe(3);
      expect(r.porcentajeEficacia).toBe(1);
    });

    it('descuenta lo ejecutado con retraso para eficiencia', () => {
      // 3 programados: 1 tarde (rojo), 1 a tiempo (blanco), 1 adelantado (verde)
      const r = calcularIndicadores([mes(1, 3, 1, 1, 1)], 12);
      expect(r.eficacia).toBe(3); // cantidad: se hizo todo
      expect(r.eficiencia).toBe(2); // oportunidad: el retrasado no cuenta
    });

    it('ejecutar todo con retraso da eficacia plena pero eficiencia nula', () => {
      const r = calcularIndicadores([mes(1, 2, 2, 0, 0)], 12);
      expect(r.porcentajeEficacia).toBe(1);
      expect(r.porcentajeEficiencia).toBe(0);
    });

    it('topa el ratio a 1 cuando se ejecuta de más', () => {
      const r = calcularIndicadores([mes(1, 2, 0, 5, 0)], 12);
      expect(r.eficacia).toBe(2);
      expect(r.porcentajeEficacia).toBe(1);
    });

    it('devuelve null (equivalente al "" del Excel) si no hay nada programado', () => {
      const r = calcularIndicadores([mes(1, 0)], 12);
      expect(r.porcentajeEficacia).toBeNull();
      expect(r.porcentajeEficiencia).toBeNull();
    });

    it('respeta la ventana de corte', () => {
      const prog = [mes(1, 2, 0, 2, 0), mes(6, 5, 0, 0, 0)];
      expect(calcularIndicadores(prog, 2).programado).toBe(2); // solo Ene-Feb
      expect(calcularIndicadores(prog, 12).programado).toBe(7);
    });
  });

  describe('calcularIndicadoresPgr — agregación de la cabecera', () => {
    it('promedia los porcentajes por actividad, NO el ratio de las sumas', () => {
      // Actividad A: 1/1 = 100 %   ·   Actividad B: 1/3 = 33.3 %
      // Promedio de %      → (1 + 0.3333) / 2 = 0.6667   ← lo que hace el Excel
      // Ratio de sumas     → 2/4              = 0.5      ← lo que NO hace
      const r = calcularIndicadoresPgr(
        [
          { programacion: [mes(1, 1, 0, 1, 0)] },
          { programacion: [mes(1, 3, 0, 1, 0)] },
        ],
        12,
        12,
      );
      expect(r.periodo.porcentajeEficacia).toBeCloseTo(0.6666666667, 9);
      expect(r.periodo.porcentajeEficacia).not.toBeCloseTo(0.5, 9);
    });

    it('ignora las actividades sin programación en la ventana', () => {
      const r = calcularIndicadoresPgr(
        [
          { programacion: [mes(1, 2, 0, 2, 0)] }, // 100 %
          { programacion: [mes(1, 0)] }, // sin programar → se ignora
        ],
        12,
        12,
      );
      expect(r.periodo.porcentajeEficacia).toBe(1);
    });

    it('suma las cantidades aunque promedie los porcentajes', () => {
      const r = calcularIndicadoresPgr(
        [
          { programacion: [mes(1, 2, 0, 2, 0)] },
          { programacion: [mes(1, 3, 0, 1, 0)] },
        ],
        12,
        12,
      );
      expect(r.periodo.programado).toBe(5);
      expect(r.periodo.eficacia).toBe(3);
    });
  });

  /**
   * Regresión contra el documento auténtico:
   * «PGR Rev.3 ELECTRICO - INSTRUMENTACION», gestión 2026, mesCorte = 2.
   *
   * En el periodo Ene-Feb hay 13 actividades con programación. Doce están al
   * 100 % y una al 75 % (3 ejecutados de 4 programados), de donde:
   *
   *     (12 × 1 + 0.75) / 13 = 12.75 / 13 = 0.980769230769…
   *
   * que es exactamente el valor que muestra la cabecera del Excel.
   */
  describe('regresión contra el PGR real (1.02.P06.F29 Rev.3)', () => {
    // Reproduce las 13 actividades con programación en Ene-Feb del documento
    // auténtico, respetando sus totales exactos: 27 programados y 26
    // ejecutados. Doce actividades al 100 % y una al 75 % (3 de 4).
    const actividades = [
      ...Array.from({ length: 11 }, () => ({
        programacion: [mes(1, 2, 0, 2, 0)], // 11 × 2 = 22 prog · 22 real
      })),
      { programacion: [mes(1, 1, 0, 1, 0)] }, //  1 prog ·  1 real → 100 %
      { programacion: [mes(1, 4, 0, 3, 0)] }, //  4 prog ·  3 real →  75 %
    ];

    it('reproduce el 98.0769 % de avance del periodo que muestra el Excel', () => {
      const r = calcularIndicadoresPgr(actividades, 2, 12);
      expect(r.periodo.porcentajeEficacia).toBeCloseTo(0.9807692308, 9);
    });

    it('reproduce los totales de la cabecera: 27 programados, 26 ejecutados', () => {
      const r = calcularIndicadoresPgr(actividades, 2, 12);
      expect(r.periodo.programado).toBe(27);
      expect(r.periodo.eficacia).toBe(26);
    });

    it('el ratio de sumas daría otro número — por eso se promedian los %', () => {
      const r = calcularIndicadoresPgr(actividades, 2, 12);
      expect(26 / 27).toBeCloseTo(0.962962963, 9); // ratio de sumas
      expect(r.periodo.porcentajeEficacia).not.toBeCloseTo(26 / 27, 5);
    });
  });

  describe('derivarMesesProgramados', () => {
    it('devuelve solo los meses con cantidad programada', () => {
      const r = derivarMesesProgramados(
        [mes(1, 2), mes(2, 0), mes(5, 1)],
        MESES,
      );
      expect(r).toEqual(['Ene', 'May']);
    });
  });
});
