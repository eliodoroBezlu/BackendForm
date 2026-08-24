import { NivelRiesgo } from '../domain/nivel-riesgo';
import { EficaciaControl } from '../domain/eficacia-control.util';

/**
 * Resultado de **analizar** un Excel de matriz de riesgos, sin escribir nada.
 *
 * La importación es de dos pasos a propósito: primero se analiza y se muestra
 * la comparación `Excel → Sistema`, y solo después de confirmarla se guarda.
 * Importar a ciegas convertiría el archivo en la verdad; analizando primero,
 * cada importación es además una verificación de que el motor reproduce la
 * metodología.
 */

/** Un valor derivado donde el Excel y el motor no coinciden. */
export interface Discrepancia {
  fila: number;
  campo:
    | 'probabilidad'
    | 'resultado'
    | 'nivelInicial'
    | 'nivelActual'
    | 'eficacia';
  enExcel: string | number | null;
  calculado: string | number | null;
}

export interface ControlAnalizado {
  fila: number;
  familiaControl: string;
  medida: string;
  familiaVerificador?: string;
  verificador: string;
  calidadControl: string;
  jerarquiaControl: string;
  /** Recalculada por el motor; es la que se guardaría. */
  eficacia: EficaciaControl | null;
  /** La que traía el archivo, para poder compararlas. */
  eficaciaExcel: string | null;
}

export interface RiesgoAnalizado {
  /** Fila donde arranca el bloque, para localizarlo en el archivo. */
  fila: number;
  numero: number;
  areaProcesoAlcance: string;
  actividadTarea: string;
  condicion: string;
  categoria: string;
  familiaPeligro: string;
  descripcionPeligro: string;
  familiaRiesgo: string;
  descripcionRiesgo: string;

  exposicion: number;
  posibilidad: number;
  severidad: number;

  // Recalculados por el motor
  probabilidad: number | null;
  resultado: number | null;
  nivelInicial: NivelRiesgo | null;
  nivelActual: NivelRiesgo | null;

  // Lo que traía el archivo
  probabilidadExcel: number | null;
  resultadoExcel: number | null;
  nivelInicialExcel: string | null;
  nivelActualExcel: string | null;

  controles: ControlAnalizado[];
  /** `true` si el nivel actual obliga a generar actividades de PGR. */
  requierePgr: boolean;

  discrepancias: Discrepancia[];
  /** Problemas no bloqueantes: valores fuera de catálogo, campos vacíos… */
  advertencias: string[];
}

export interface CabeceraAnalizada {
  gerencia?: string;
  superintendencia?: string;
  area?: string;
  elaboradoPor?: string;
  revisadoAprobadoPor?: string;
  fechaElaboracion?: string;
  fechaAprobacion?: string;
  anio?: number;
}

export interface ResumenImportacion {
  totalRiesgos: number;
  totalControles: number;
  riesgosConDiscrepancias: number;
  totalDiscrepancias: number;
  /** Cuántos riesgos hay en cada nivel actual. */
  porNivel: Record<string, number>;
  /** Riesgos SUSTANCIAL o INACEPTABLE: los que alimentarán el PGR. */
  requierenPgr: number;
  categorias: string[];
}

/** Área del maestro propuesta para el nombre que trae el archivo. */
export interface AreaCandidata {
  codigo?: string;
  nombre: string;
  superintendencia: string;
  /** Cómo se llegó a ella: ayuda a la UI a explicar la sugerencia. */
  coincidencia: 'exacta' | 'parcial';
}

export interface ResultadoAnalisis {
  archivo: string;
  hoja: string;
  cabecera: CabeceraAnalizada;
  riesgos: RiesgoAnalizado[];
  resumen: ResumenImportacion;
  /**
   * Áreas del maestro compatibles con la cabecera del archivo.
   *
   * Los nombres no coinciden literalmente —el Excel dice "Mantenimiento
   * Chancado" y el maestro "Chancado"—, así que la UI debe mostrar un selector
   * en vez de dar por buena una coincidencia automática. Con exactamente una
   * candidata se puede preseleccionar; con varias o ninguna, hay que elegir.
   */
  areasCandidatas?: AreaCandidata[];
  /**
   * Problemas que impiden importar (no se encontró la cabecera, no hay
   * riesgos, falta el área…). Con errores no se debe ofrecer confirmar.
   */
  errores: string[];
  /** Problemas de todo el archivo que no impiden importar. */
  advertencias: string[];
}
