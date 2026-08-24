import {
  TABLA_PROBABILIDAD,
  calcularProbabilidad,
  calcularResultado,
  calcularNivelInicial,
  evaluarRiesgoPuro,
} from './evaluacion-riesgo.util';
import { MATRIZ_CHANCADO } from './__fixtures__/matriz-chancado.fixture';

describe('evaluacion-riesgo.util', () => {
  describe('calcularProbabilidad — tabla 6×6', () => {
    it('lee la tabla en el orden [posibilidad][exposicion]', () => {
      // Del Excel: PARÁMETROS!B2 con OFFSET(B2, K, J).
      expect(calcularProbabilidad(1, 1)).toBe(5);
      expect(calcularProbabilidad(6, 6)).toBe(1);
      expect(calcularProbabilidad(4, 3)).toBe(3); // Exp=4, Pos=3
      expect(calcularProbabilidad(3, 4)).toBe(3); // Exp=3, Pos=4
    });

    it('la tabla es simétrica: exposición y posibilidad pesan igual', () => {
      // Propiedad verificada sobre las 36 celdas. No es obvia —la fórmula del
      // Excel distingue los ejes con OFFSET(B2, K, J)— pero la tabla resulta
      // simétrica, así que invertir los ejes no cambia el resultado.
      //
      // Se deja fijada como test: si alguien edita la tabla y rompe la
      // simetría sin querer, salta aquí.
      for (let exp = 1; exp <= 6; exp++) {
        for (let pos = 1; pos <= 6; pos++) {
          expect(calcularProbabilidad(exp, pos)).toBe(
            calcularProbabilidad(pos, exp),
          );
        }
      }
    });

    it('la escala va al revés de la intuición: más exposición → menor número', () => {
      expect(calcularProbabilidad(1, 1)).toBeGreaterThan(
        calcularProbabilidad(6, 1)!,
      );
    });

    it('rechaza valores fuera de 1..6', () => {
      expect(calcularProbabilidad(0, 3)).toBeNull();
      expect(calcularProbabilidad(7, 3)).toBeNull();
      expect(calcularProbabilidad(3, 0)).toBeNull();
      expect(calcularProbabilidad(2.5, 3)).toBeNull();
    });

    it('la tabla tiene 6×6 y solo valores 1..5', () => {
      expect(TABLA_PROBABILIDAD).toHaveLength(6);
      for (const fila of TABLA_PROBABILIDAD) {
        expect(fila).toHaveLength(6);
        for (const v of fila) expect(v).toBeGreaterThanOrEqual(1);
        for (const v of fila) expect(v).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('calcularResultado', () => {
    it('multiplica probabilidad por severidad', () => {
      expect(calcularResultado(4, 5)).toBe(20);
      expect(calcularResultado(1, 1)).toBe(1);
    });

    it('devuelve null si falta la probabilidad o la severidad es inválida', () => {
      expect(calcularResultado(null, 5)).toBeNull();
      expect(calcularResultado(4, 0)).toBeNull();
      expect(calcularResultado(4, 6)).toBeNull();
    });
  });

  describe('calcularNivelInicial — cortes 2/6/10/15', () => {
    it('aplica los cortes en los bordes exactos', () => {
      expect(calcularNivelInicial(1)).toBe('ACEPTABLE');
      expect(calcularNivelInicial(2)).toBe('ACEPTABLE');
      expect(calcularNivelInicial(3)).toBe('BAJA');
      expect(calcularNivelInicial(6)).toBe('BAJA');
      expect(calcularNivelInicial(7)).toBe('ACEPTABLE CON REVISIÓN');
      expect(calcularNivelInicial(10)).toBe('ACEPTABLE CON REVISIÓN');
      expect(calcularNivelInicial(11)).toBe('SUSTANCIAL');
      expect(calcularNivelInicial(15)).toBe('SUSTANCIAL');
      expect(calcularNivelInicial(16)).toBe('INACEPTABLE');
      expect(calcularNivelInicial(25)).toBe('INACEPTABLE');
    });

    it('devuelve null sin resultado', () => {
      expect(calcularNivelInicial(null)).toBeNull();
    });
  });

  describe('evaluarRiesgoPuro', () => {
    it('encadena las tres columnas derivadas', () => {
      // Riesgo N°2 de la matriz real: Exp=3, Pos=2, Sev=5.
      expect(
        evaluarRiesgoPuro({ exposicion: 3, posibilidad: 2, severidad: 5 }),
      ).toEqual({
        probabilidad: 4,
        resultado: 20,
        nivelInicial: 'INACEPTABLE',
      });
    });

    it('propaga null sin romperse cuando la evaluación está incompleta', () => {
      expect(
        evaluarRiesgoPuro({ exposicion: 0, posibilidad: 2, severidad: 5 }),
      ).toEqual({ probabilidad: null, resultado: null, nivelInicial: null });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Regresión contra el documento real
  // ──────────────────────────────────────────────────────────────────────────
  describe('regresión — matriz real de Planta Chancado', () => {
    it(`reproduce la probabilidad de los ${MATRIZ_CHANCADO.length} riesgos`, () => {
      const fallos = MATRIZ_CHANCADO.filter(
        (r) =>
          calcularProbabilidad(r.exposicion, r.posibilidad) !== r.probabilidad,
      ).map(
        (r) =>
          `fila ${r.fila}: Exp=${r.exposicion} Pos=${r.posibilidad} → esperado ${r.probabilidad}`,
      );

      expect(fallos).toEqual([]);
    });

    it('reproduce el resultado (probabilidad × severidad)', () => {
      const fallos = MATRIZ_CHANCADO.filter(
        (r) => calcularResultado(r.probabilidad, r.severidad) !== r.resultado,
      ).map(
        (r) =>
          `fila ${r.fila}: ${r.probabilidad}×${r.severidad} → esperado ${r.resultado}`,
      );

      expect(fallos).toEqual([]);
    });

    it('reproduce el nivel de riesgo inicial', () => {
      const fallos = MATRIZ_CHANCADO.filter(
        (r) => calcularNivelInicial(r.resultado) !== r.nivelInicial,
      ).map(
        (r) =>
          `fila ${r.fila}: N=${r.resultado} → esperado "${r.nivelInicial}"`,
      );

      expect(fallos).toEqual([]);
    });
  });
});
