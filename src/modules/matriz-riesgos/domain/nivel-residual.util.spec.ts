import {
  calcularNivelResidual,
  explicarNivelResidual,
  resumirEficacias,
} from './nivel-residual.util';
import { EficaciaControl, normalizarEficacia } from './eficacia-control.util';
import { NivelRiesgo } from './nivel-riesgo';
import { MATRIZ_CHANCADO } from './__fixtures__/matriz-chancado.fixture';

const EF: EficaciaControl = 'Control/Acción Eficaz';
const SAT: EficaciaControl = 'Control/Acción Satisfactorio';
const NO: EficaciaControl = 'Control/Acción No Eficaz';

describe('nivel-residual.util', () => {
  describe('resumirEficacias', () => {
    it('ignora las eficacias nulas, como COUNTA−COUNTBLANK del Excel', () => {
      expect(resumirEficacias([EF, null, SAT, null, NO])).toEqual({
        total: 3,
        eficaces: 1,
        satisfactorios: 1,
        noEficaces: 1,
      });
    });
  });

  describe('sin controles', () => {
    it('devuelve el nivel inicial: un riesgo sin controles no está mitigado', () => {
      expect(calcularNivelResidual('INACEPTABLE', [])).toBe('INACEPTABLE');
      expect(calcularNivelResidual('INACEPTABLE', [null, null])).toBe(
        'INACEPTABLE',
      );
    });
  });

  describe('1 control', () => {
    it('un control eficaz baja un escalón en todos los niveles', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF])).toBe('SUSTANCIAL');
      expect(calcularNivelResidual('SUSTANCIAL', [EF])).toBe(
        'ACEPTABLE CON REVISIÓN',
      );
      expect(calcularNivelResidual('ACEPTABLE CON REVISIÓN', [EF])).toBe(
        'BAJA',
      );
    });

    it('BAJA sí baja con un solo control eficaz — sólo en este caso', () => {
      // Es la única rama del Excel donde BAJA se reduce con 1 eficaz.
      expect(calcularNivelResidual('BAJA', [EF])).toBe('ACEPTABLE');
    });

    it('un control no eficaz o satisfactorio no reduce nada', () => {
      expect(calcularNivelResidual('INACEPTABLE', [SAT])).toBe('INACEPTABLE');
      expect(calcularNivelResidual('INACEPTABLE', [NO])).toBe('INACEPTABLE');
    });
  });

  describe('2 controles', () => {
    it('dos eficaces bajan dos escalones', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF, EF])).toBe(
        'ACEPTABLE CON REVISIÓN',
      );
      expect(calcularNivelResidual('SUSTANCIAL', [EF, EF])).toBe('BAJA');
      expect(calcularNivelResidual('ACEPTABLE CON REVISIÓN', [EF, EF])).toBe(
        'ACEPTABLE',
      );
    });

    it('un eficaz baja un escalón', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF, SAT])).toBe(
        'SUSTANCIAL',
      );
      expect(calcularNivelResidual('INACEPTABLE', [EF, NO])).toBe('SUSTANCIAL');
    });

    it('ningún eficaz no reduce', () => {
      expect(calcularNivelResidual('SUSTANCIAL', [SAT, SAT])).toBe(
        'SUSTANCIAL',
      );
      expect(calcularNivelResidual('SUSTANCIAL', [NO, NO])).toBe('SUSTANCIAL');
    });

    it('EXCEPCIÓN: BAJA necesita 2 eficaces, uno solo no alcanza', () => {
      // Excel: IF(O="BAJA", IF(Ef>=2,"ACEPTABLE","BAJA"))
      expect(calcularNivelResidual('BAJA', [EF, SAT])).toBe('BAJA');
      expect(calcularNivelResidual('BAJA', [EF, NO])).toBe('BAJA');
      expect(calcularNivelResidual('BAJA', [EF, EF])).toBe('ACEPTABLE');
    });
  });

  describe('3 o más controles', () => {
    it('dos o más no eficaces bloquean cualquier reducción', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF, EF, NO, NO])).toBe(
        'INACEPTABLE',
      );
      expect(calcularNivelResidual('SUSTANCIAL', [EF, EF, EF, NO, NO])).toBe(
        'SUSTANCIAL',
      );
    });

    it('sin no-eficaces y con ≥2 eficaces baja dos escalones', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF, EF, SAT])).toBe(
        'ACEPTABLE CON REVISIÓN',
      );
      expect(calcularNivelResidual('SUSTANCIAL', [EF, EF, SAT])).toBe('BAJA');
    });

    it('el resto de combinaciones baja un escalón', () => {
      expect(calcularNivelResidual('INACEPTABLE', [EF, SAT, NO])).toBe(
        'SUSTANCIAL',
      );
      expect(calcularNivelResidual('INACEPTABLE', [SAT, SAT, SAT])).toBe(
        'SUSTANCIAL',
      );
    });

    it('EXCEPCIÓN: BAJA no baja salvo con 0 no-eficaces y ≥2 eficaces', () => {
      // Este es el caso que falló 1/39 en la primera versión (fila 259).
      expect(calcularNivelResidual('BAJA', [EF, SAT, SAT])).toBe('BAJA');
      expect(calcularNivelResidual('BAJA', [SAT, SAT, SAT])).toBe('BAJA');
      expect(calcularNivelResidual('BAJA', [EF, EF, NO])).toBe('BAJA');
      expect(calcularNivelResidual('BAJA', [EF, EF, SAT])).toBe('ACEPTABLE');
    });
  });

  describe('bordes', () => {
    it('ACEPTABLE es el piso y no baja más', () => {
      expect(calcularNivelResidual('ACEPTABLE', [EF, EF, EF])).toBe(
        'ACEPTABLE',
      );
    });

    it('sin nivel inicial no hay residual', () => {
      expect(calcularNivelResidual(null, [EF])).toBeNull();
    });
  });

  describe('explicarNivelResidual', () => {
    it('explica el bloqueo por controles no eficaces', () => {
      const { motivo } = explicarNivelResidual('INACEPTABLE', [NO, NO, EF]);
      expect(motivo).toContain('no eficaces');
    });

    it('explica la exigencia particular de BAJA', () => {
      const { motivo } = explicarNivelResidual('BAJA', [EF, SAT, SAT]);
      expect(motivo).toContain('2 controles eficaces');
    });

    it('explica la reducción cuando la hay', () => {
      const { nivelResidual, motivo } = explicarNivelResidual('INACEPTABLE', [
        EF,
        EF,
        SAT,
      ]);
      expect(nivelResidual).toBe('ACEPTABLE CON REVISIÓN');
      expect(motivo).toContain('INACEPTABLE');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Regresión contra el documento real — el criterio de aceptación del MVP
  // ──────────────────────────────────────────────────────────────────────────
  describe('regresión — matriz real de Planta Chancado', () => {
    it(`reproduce el nivel actual de los ${MATRIZ_CHANCADO.length} riesgos`, () => {
      const fallos = MATRIZ_CHANCADO.filter((r) => {
        const eficacias = r.controles.map((c) =>
          normalizarEficacia(c.eficacia),
        );
        return (
          calcularNivelResidual(r.nivelInicial as NivelRiesgo, eficacias) !==
          r.nivelActual
        );
      }).map((r) => {
        const eficacias = r.controles.map((c) =>
          normalizarEficacia(c.eficacia),
        );
        const { eficaces, noEficaces, total } = resumirEficacias(eficacias);
        return (
          `fila ${r.fila}: ${r.nivelInicial} con ${total} ctrl ` +
          `(${eficaces} efic, ${noEficaces} no-efic) → ` +
          `Excel "${r.nivelActual}", motor "${calcularNivelResidual(r.nivelInicial as NivelRiesgo, eficacias)}"`
        );
      });

      expect(fallos).toEqual([]);
    });

    it('el fixture ejerce los tres tramos del algoritmo (1, 2 y ≥3 controles)', () => {
      const tramos = new Set(
        MATRIZ_CHANCADO.map((r) =>
          r.controles.length >= 3 ? '3+' : String(r.controles.length),
        ),
      );
      // Los tres tramos están cubiertos con datos reales: 6 riesgos con 1
      // control, 4 con 2 y 35 con 3 o más.
      expect(tramos).toContain('1');
      expect(tramos).toContain('2');
      expect(tramos).toContain('3+');
    });

    it('los riesgos que requieren PGR son SUSTANCIAL e INACEPTABLE', () => {
      const criticos = MATRIZ_CHANCADO.filter((r) =>
        ['SUSTANCIAL', 'INACEPTABLE'].includes(r.nivelActual),
      );
      // 15 de los 45 riesgos de esta matriz generarían actividades de PGR.
      expect(criticos).toHaveLength(15);
      expect(MATRIZ_CHANCADO).toHaveLength(45);
    });
  });
});
