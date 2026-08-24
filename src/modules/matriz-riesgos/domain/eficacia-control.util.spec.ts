import {
  calcularEficacia,
  calcularEficaciaDesdeTextos,
  nivelJerarquiaDesdeEtiqueta,
  normalizarCalidad,
  jerarquiaDeCategoria,
  JERARQUIA_DSRC,
  JERARQUIA_ESTANDAR,
  NivelJerarquia,
} from './eficacia-control.util';
import { MATRIZ_CHANCADO } from './__fixtures__/matriz-chancado.fixture';

describe('eficacia-control.util', () => {
  describe('nivelJerarquiaDesdeEtiqueta', () => {
    it('extrae el prefijo numérico, que es la clave estable', () => {
      expect(nivelJerarquiaDesdeEtiqueta('4. Ingeniería')).toBe(4);
      expect(nivelJerarquiaDesdeEtiqueta('1. EPP')).toBe(1);
      // DSRC usa otras etiquetas pero el mismo prefijo.
      expect(nivelJerarquiaDesdeEtiqueta('6. Acuerdos estratégicos')).toBe(6);
    });

    it('devuelve null si no hay prefijo válido', () => {
      expect(nivelJerarquiaDesdeEtiqueta('Ingeniería')).toBeNull();
      expect(nivelJerarquiaDesdeEtiqueta('7. Inventado')).toBeNull();
      expect(nivelJerarquiaDesdeEtiqueta('')).toBeNull();
      expect(nivelJerarquiaDesdeEtiqueta(null)).toBeNull();
    });
  });

  describe('normalizarCalidad', () => {
    it('acepta el texto exacto del Excel', () => {
      expect(normalizarCalidad('A. Mayor 80%')).toBe('A. Mayor 80%');
      expect(normalizarCalidad('  B. 50%  y 80%  ')).toBe('B. 50% y 80%');
    });

    it('rechaza lo desconocido', () => {
      expect(normalizarCalidad('D. Otra')).toBeNull();
      expect(normalizarCalidad(null)).toBeNull();
    });
  });

  describe('calcularEficacia — matriz 6×3', () => {
    it('la calidad manda: mayor a 80% es Eficaz de la jerarquía 2 a la 6', () => {
      for (const j of [2, 3, 4, 5, 6] as NivelJerarquia[]) {
        expect(calcularEficacia(j, 'A. Mayor 80%')).toBe(
          'Control/Acción Eficaz',
        );
      }
    });

    it('el EPP nunca llega a Eficaz, ni con calidad > 80%', () => {
      expect(calcularEficacia(1, 'A. Mayor 80%')).toBe(
        'Control/Acción Satisfactorio',
      );
      expect(calcularEficacia(1, 'B. 50% y 80%')).toBe(
        'Control/Acción No Eficaz',
      );
      expect(calcularEficacia(1, 'C. Menor a 50%')).toBe(
        'Control/Acción No Eficaz',
      );
    });

    it('eliminación y sustitución no caen a No Eficaz ni con calidad baja', () => {
      expect(calcularEficacia(6, 'C. Menor a 50%')).toBe(
        'Control/Acción Satisfactorio',
      );
      expect(calcularEficacia(5, 'C. Menor a 50%')).toBe(
        'Control/Acción Satisfactorio',
      );
      // De la 4 hacia abajo sí.
      expect(calcularEficacia(4, 'C. Menor a 50%')).toBe(
        'Control/Acción No Eficaz',
      );
    });

    it('devuelve null si falta cualquiera de los dos ejes', () => {
      expect(calcularEficacia(null, 'A. Mayor 80%')).toBeNull();
      expect(calcularEficacia(4, null)).toBeNull();
    });
  });

  describe('jerarquiaDeCategoria', () => {
    it('DSRC usa su propia jerarquía', () => {
      expect(jerarquiaDeCategoria('DSRC/Estratégico')).toBe(JERARQUIA_DSRC);
      expect(jerarquiaDeCategoria('DSRC/Operativo')).toBe(JERARQUIA_DSRC);
    });

    it('el resto de categorías comparten la estándar', () => {
      for (const c of [
        'Seguridad',
        'Salud',
        'Medio Ambiente',
        'Operacional',
        'Legal',
        'Rel. Gubernamentales',
        'Financiero',
      ] as const) {
        expect(jerarquiaDeCategoria(c)).toBe(JERARQUIA_ESTANDAR);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Regresión contra el documento real
  // ──────────────────────────────────────────────────────────────────────────
  describe('regresión — matriz real de Planta Chancado', () => {
    const controles = MATRIZ_CHANCADO.flatMap((r) =>
      r.controles.map((c) => ({ ...c, fila: r.fila })),
    );

    it('hay una muestra significativa de controles', () => {
      expect(controles.length).toBeGreaterThan(250);
    });

    it('reproduce la eficacia de todos los controles', () => {
      const fallos = controles
        .filter(
          (c) =>
            calcularEficaciaDesdeTextos(c.jerarquia, c.calidad) !== c.eficacia,
        )
        .map(
          (c) =>
            `riesgo fila ${c.fila}: [${c.calidad}] [${c.jerarquia}] → esperado "${c.eficacia}", ` +
            `obtenido "${calcularEficaciaDesdeTextos(c.jerarquia, c.calidad)}"`,
        );

      expect(fallos).toEqual([]);
    });

    it('cubre las tres calidades y varias jerarquías', () => {
      const calidades = new Set(controles.map((c) => c.calidad));
      const jerarquias = new Set(
        controles.map((c) => nivelJerarquiaDesdeEtiqueta(c.jerarquia)),
      );
      expect(calidades.size).toBe(3);
      expect(jerarquias.size).toBeGreaterThanOrEqual(4);
    });
  });
});
