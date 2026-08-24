import { evaluarRiesgoPuro } from './evaluacion-riesgo.util';
import {
  calcularEficaciaDesdeTextos,
  EficaciaControl,
} from './eficacia-control.util';
import { calcularNivelResidual } from './nivel-residual.util';
import { NivelRiesgo } from './nivel-riesgo';

/** Lo único que el usuario escribe de un control para que se pueda evaluar. */
export interface ControlEvaluable {
  calidadControl: string;
  jerarquiaControl: string;
}

export interface EntradaRiesgoCompleto {
  exposicion: number;
  posibilidad: number;
  severidad: number;
  controles: readonly ControlEvaluable[];
}

export interface RiesgoEvaluado {
  probabilidad: number | null;
  resultado: number | null;
  nivelInicial: NivelRiesgo | null;
  nivelActual: NivelRiesgo | null;
  /** Eficacia de cada control, en el mismo orden que entraron. */
  eficacias: (EficaciaControl | null)[];
}

/**
 * Evalúa un riesgo entero: nivel inicial, eficacia de cada control y nivel
 * residual.
 *
 * Es la puerta única para los campos derivados de la matriz. Se usa en cada
 * escritura del CRUD y **nunca** se aceptan estos valores del cliente: si el
 * navegador pudiera mandar el nivel, un riesgo INACEPTABLE podría llegar a la
 * base como ACEPTABLE y desaparecer del PGR sin que nadie lo note.
 *
 * El frontend puede llamar a las mismas funciones de dominio para previsualizar
 * mientras se escribe, pero lo que se guarda es siempre lo que calcula acá.
 */
export function evaluarRiesgoCompleto(
  entrada: EntradaRiesgoCompleto,
): RiesgoEvaluado {
  const { probabilidad, resultado, nivelInicial } = evaluarRiesgoPuro({
    exposicion: entrada.exposicion,
    posibilidad: entrada.posibilidad,
    severidad: entrada.severidad,
  });

  const eficacias = entrada.controles.map((c) =>
    calcularEficaciaDesdeTextos(c.jerarquiaControl, c.calidadControl),
  );

  return {
    probabilidad,
    resultado,
    nivelInicial,
    nivelActual: calcularNivelResidual(nivelInicial, eficacias),
    eficacias,
  };
}
