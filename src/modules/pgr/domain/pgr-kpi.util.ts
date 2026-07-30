/**
 * Cálculo de los indicadores del PGR (formulario 1.02.P06.F29).
 *
 * Réplica exacta de las fórmulas de la planilla Excel original, decodificadas
 * desde el documento real. Es TypeScript puro: sin Nest, sin Mongoose, sin
 * dependencias — para poder testearlo aislado.
 *
 * ── Fórmulas originales ────────────────────────────────────────────────────
 *
 *   EFICACIA (fila `Real`, columna AR):
 *     IF( SUM(OFFSET(H:AQ, 0,0,1, $J$4*3)) > SUM(prog),
 *         SUM(prog),                               ← tope, nunca supera el 100 %
 *         SUM(OFFSET(H:AQ, 0,0,1, $J$4*3)) )
 *
 *   EFICIENCIA (fila `Real`, columna AS):
 *     SUM(OFFSET(H:AQ, 0,0,1, $J$4*3))
 *       − SUM(INDEX(H:AQ, 1, SEQUENCE(1, $J$4, 1, 3)))
 *
 * El `SEQUENCE(1, $J$4, 1, 3)` recorre las columnas 1, 4, 7, 10… — es decir,
 * **la primera sub-columna de cada mes**, que en la planilla está pintada de
 * rojo y significa «actividad ejecutada mes pasado». Por eso la eficiencia
 * descuenta lo ejecutado con retraso.
 *
 * En resumen:
 *   • Eficacia   → ¿se hizo la cantidad?  (cuenta las 3 categorías, con tope)
 *   • Eficiencia → ¿se hizo a tiempo?     (descuenta lo hecho con retraso)
 */

export interface ProgramacionMesLike {
  mes: number;
  programado: number;
  realMesPasado?: number;
  realDelMes?: number;
  realMesAdelantado?: number;
}

export interface IndicadoresVentana {
  /** Suma de lo programado dentro de la ventana. */
  programado: number;
  /** Ejecutado contando las 3 categorías, topado a `programado`. */
  eficacia: number;
  /** Ejecutado a tiempo o adelantado (excluye lo ejecutado con retraso). */
  eficiencia: number;
  /** `eficacia / programado`, topado a 1. `null` si no hay nada programado. */
  porcentajeEficacia: number | null;
  /** `eficiencia / programado`, topado a 1. `null` si no hay nada programado. */
  porcentajeEficiencia: number | null;
}

export interface IndicadoresPgr {
  periodo: IndicadoresVentana;
  gestion: IndicadoresVentana;
}

/** Total ejecutado en un mes, sumando las tres categorías de oportunidad. */
function totalReal(p: ProgramacionMesLike): number {
  return (
    (p.realMesPasado ?? 0) + (p.realDelMes ?? 0) + (p.realMesAdelantado ?? 0)
  );
}

/** Ejecutado que cuenta para eficiencia: a tiempo + adelantado, sin retrasos. */
function realATiempo(p: ProgramacionMesLike): number {
  return (p.realDelMes ?? 0) + (p.realMesAdelantado ?? 0);
}

function ratio(valor: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.min(valor / base, 1);
}

/**
 * Calcula los indicadores de una actividad para una ventana de meses.
 *
 * @param programacion filas de programación de la actividad
 * @param hastaMes     último mes incluido (1-12); equivale a `$J$4` / `$W$4`
 */
export function calcularIndicadores(
  programacion: ProgramacionMesLike[],
  hastaMes: number,
): IndicadoresVentana {
  const enVentana = programacion.filter((p) => p.mes >= 1 && p.mes <= hastaMes);

  const programado = enVentana.reduce((acc, p) => acc + (p.programado ?? 0), 0);
  const ejecutadoTotal = enVentana.reduce((acc, p) => acc + totalReal(p), 0);
  const ejecutadoATiempo = enVentana.reduce(
    (acc, p) => acc + realATiempo(p),
    0,
  );

  // El tope replica el `IF(... > SUM(prog), SUM(prog), ...)` del Excel:
  // ejecutar de más no puede empujar el indicador por encima del 100 %.
  const eficacia = Math.min(ejecutadoTotal, programado);
  const eficiencia = Math.min(ejecutadoATiempo, programado);

  return {
    programado,
    eficacia,
    eficiencia,
    porcentajeEficacia: ratio(eficacia, programado),
    porcentajeEficiencia: ratio(eficiencia, programado),
  };
}

/**
 * Indicadores de una actividad en sus dos ventanas: periodo y gestión.
 */
export function calcularIndicadoresActividad(
  programacion: ProgramacionMesLike[],
  mesCorte: number,
  ventanaGestion: number,
): IndicadoresPgr {
  return {
    periodo: calcularIndicadores(programacion, mesCorte),
    gestion: calcularIndicadores(programacion, ventanaGestion),
  };
}

/**
 * Agrega una ventana a nivel de PGR.
 *
 * ⚠️ El porcentaje **no** es `Σeficacia / Σprogramado`, sino el **promedio de
 * los porcentajes de cada actividad**. Así lo hace la planilla original:
 *
 *   Cabecera:  `IF(N5>0, AVERAGE($AV$9:$AV$920), 0)`
 *   Por fila:  `IF(AR13>0, IF(AR14/AR13>1, 1, AR14/AR13), "")`
 *
 * La fila devuelve `""` cuando no hay nada programado y `AVERAGE` ignora el
 * texto, así que **solo promedian las actividades con programación en la
 * ventana**. Cambiar esto por un ratio de sumas da un número distinto y no
 * coincide con el documento oficial.
 *
 * Las cantidades (`programado`, `eficacia`, `eficiencia`) sí se suman, porque
 * la cabecera las obtiene con `SUMPRODUCT` sobre las filas `Prog.` / `Real`.
 */
function agregarVentana(
  porActividad: IndicadoresVentana[],
): IndicadoresVentana {
  const programado = porActividad.reduce((a, i) => a + i.programado, 0);
  const eficacia = porActividad.reduce((a, i) => a + i.eficacia, 0);
  const eficiencia = porActividad.reduce((a, i) => a + i.eficiencia, 0);

  const promedio = (sel: (i: IndicadoresVentana) => number | null) => {
    const vals = porActividad.map(sel).filter((v): v is number => v !== null); // ← equivale a ignorar los ""
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return {
    programado,
    eficacia,
    eficiencia,
    porcentajeEficacia: promedio((i) => i.porcentajeEficacia),
    porcentajeEficiencia: promedio((i) => i.porcentajeEficiencia),
  };
}

/**
 * Indicadores agregados de un PGR completo, replicando la cabecera del Excel.
 */
export function calcularIndicadoresPgr(
  actividades: Array<{ programacion?: ProgramacionMesLike[] }>,
  mesCorte: number,
  ventanaGestion: number,
): IndicadoresPgr {
  const porActividad = actividades.map((a) =>
    calcularIndicadoresActividad(
      a.programacion ?? [],
      mesCorte,
      ventanaGestion,
    ),
  );

  return {
    periodo: agregarVentana(porActividad.map((i) => i.periodo)),
    gestion: agregarVentana(porActividad.map((i) => i.gestion)),
  };
}

/**
 * Deriva `mesesProgramados` (campo heredado) desde `programacion[]`.
 * Se mantiene mientras el frontend siga leyendo el modelo viejo.
 */
export function derivarMesesProgramados(
  programacion: ProgramacionMesLike[],
  nombresMeses: readonly string[],
): string[] {
  return programacion
    .filter((p) => (p.programado ?? 0) > 0)
    .map((p) => nombresMeses[p.mes - 1])
    .filter((m): m is string => Boolean(m));
}
