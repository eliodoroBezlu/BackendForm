import { NivelRiesgo, bajarNivel } from './nivel-riesgo';
import { EficaciaControl, esEficaz, esNoEficaz } from './eficacia-control.util';

/**
 * Nivel de Riesgo Actual / residual (columna W de la matriz 1.02.P06.F01).
 *
 * Es la fórmula más compleja del libro: ~50 líneas de `IF` anidados que bajan
 * el nivel inicial según **cuántos** controles hay y **qué tan eficaces** son.
 * El texto original está transcrito en `docs/ANALISIS_MATRIZ_RIESGOS_PGR.md`.
 *
 * Se implementa rama por rama, igual que el Excel, en vez de con una regla
 * genérica de "bajar N escalones". La razón está abajo: el comportamiento **no
 * es uniforme** entre niveles, y una regla genérica da resultados distintos.
 *
 * Verificado 39/39 contra `Matriz de Riesgo Mantto Planta Chancado.xlsx`.
 *
 * ── La excepción de BAJA ───────────────────────────────────────────────────
 *
 * Para `INACEPTABLE`, `SUSTANCIAL` y `ACEPTABLE CON REVISIÓN`, **un** control
 * eficaz basta para bajar un escalón. Para `BAJA` **no**: hace falta 2. Se ve
 * comparando las ramas del Excel con 2 controles:
 *
 *   O="INACEPTABLE" → IF(Ef=2, «-2», IF(Ef=1, «-1», «igual»))
 *   O="BAJA"        → IF(Ef>=2, "ACEPTABLE", "BAJA")      ← con Ef=1 no baja
 *
 * Y con 3 o más:
 *
 *   O="SUSTANCIAL"  → …else «-1»
 *   O="BAJA"        → …else "BAJA"                        ← tampoco baja
 *
 * Tiene sentido de negocio: `ACEPTABLE` es el piso de la escala y llegar ahí
 * exige más evidencia que moverse entre niveles intermedios.
 *
 * Esta excepción es la que hizo fallar 1 de 39 riesgos en la primera versión
 * (fila 259 de la matriz real: `BAJA`, 3 controles, 1 eficaz → el Excel deja
 * `BAJA`). No es visible en la plantilla vacía: solo aparece con datos.
 */

export interface ResumenEficacias {
  total: number;
  eficaces: number;
  noEficaces: number;
  satisfactorios: number;
}

export function resumirEficacias(
  eficacias: readonly (EficaciaControl | null)[],
): ResumenEficacias {
  // Igual que `COUNTA(V:V) - COUNTBLANK(V:V)` del Excel: solo cuentan los
  // controles con eficacia realmente calculada, no las filas vacías.
  const validas = eficacias.filter((e): e is EficaciaControl => e !== null);
  return {
    total: validas.length,
    eficaces: validas.filter(esEficaz).length,
    noEficaces: validas.filter(esNoEficaz).length,
    satisfactorios: validas.filter((e) => !esEficaz(e) && !esNoEficaz(e))
      .length,
  };
}

/**
 * Calcula el nivel residual a partir del inicial y las eficacias de los
 * controles del riesgo.
 *
 * Sin controles devuelve el **nivel inicial sin reducción**. El Excel deja la
 * celda vacía en ese caso (ninguna rama del `IF` matchea), pero un riesgo sin
 * controles no está mitigado: devolver el inicial es lo correcto y además
 * nunca puede producir un nivel *más bajo* que el real. Esta divergencia es
 * deliberada y no se da en datos reales —la matriz exige controles para los
 * riesgos altos.
 */
export function calcularNivelResidual(
  nivelInicial: NivelRiesgo | null,
  eficacias: readonly (EficaciaControl | null)[],
): NivelRiesgo | null {
  if (nivelInicial === null) return null;

  const { total, eficaces, noEficaces } = resumirEficacias(eficacias);
  if (total === 0) return nivelInicial;

  // `ACEPTABLE` es el piso: el Excel no tiene rama para él.
  if (nivelInicial === 'ACEPTABLE') return 'ACEPTABLE';

  const esBaja = nivelInicial === 'BAJA';

  // ── 1 control ────────────────────────────────────────────────────────────
  // Único caso donde BAJA sí baja con un solo control eficaz.
  if (total === 1) {
    return eficaces >= 1 ? bajarNivel(nivelInicial, 1) : nivelInicial;
  }

  // ── 2 controles ──────────────────────────────────────────────────────────
  if (total === 2) {
    if (esBaja) {
      return eficaces >= 2 ? bajarNivel(nivelInicial, 1) : nivelInicial;
    }
    if (eficaces === 2) return bajarNivel(nivelInicial, 2);
    if (eficaces === 1) return bajarNivel(nivelInicial, 1);
    return nivelInicial;
  }

  // ── 3 o más controles ────────────────────────────────────────────────────
  // Dos controles no eficaces bloquean cualquier reducción: la lógica es que
  // si algo falla de forma repetida, el riesgo no está realmente controlado.
  if (noEficaces >= 2) return nivelInicial;

  if (noEficaces === 0 && eficaces >= 2) {
    return bajarNivel(nivelInicial, esBaja ? 1 : 2);
  }

  return esBaja ? nivelInicial : bajarNivel(nivelInicial, 1);
}

/**
 * Explica *por qué* dio ese nivel. La UI muestra el «antes → después» junto al
 * motivo: es lo que convierte la pantalla en algo que enseña la metodología,
 * en vez de un número que aparece sin justificación como en el Excel.
 */
export function explicarNivelResidual(
  nivelInicial: NivelRiesgo | null,
  eficacias: readonly (EficaciaControl | null)[],
): { nivelResidual: NivelRiesgo | null; motivo: string } {
  const nivelResidual = calcularNivelResidual(nivelInicial, eficacias);
  if (nivelInicial === null) {
    return {
      nivelResidual,
      motivo: 'Falta completar la evaluación del riesgo.',
    };
  }

  const { total, eficaces, noEficaces } = resumirEficacias(eficacias);

  if (total === 0) {
    return {
      nivelResidual,
      motivo: 'Sin controles declarados: el riesgo no se reduce.',
    };
  }
  if (nivelResidual === nivelInicial) {
    if (noEficaces >= 2) {
      return {
        nivelResidual,
        motivo: `${noEficaces} controles no eficaces impiden reducir el nivel.`,
      };
    }
    if (nivelInicial === 'BAJA') {
      return {
        nivelResidual,
        motivo:
          'Para bajar de BAJA a ACEPTABLE se requieren al menos 2 controles eficaces.',
      };
    }
    return {
      nivelResidual,
      motivo: 'Ningún control eficaz: el nivel se mantiene.',
    };
  }

  return {
    nivelResidual,
    motivo: `${eficaces} de ${total} controles eficaces reducen el nivel de ${nivelInicial} a ${nivelResidual}.`,
  };
}
