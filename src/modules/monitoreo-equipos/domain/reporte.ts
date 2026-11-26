/**
 * El reporte de monitoreo (formato 2.03.P01.R09) sin base ni framework: sus
 * estados, sus cálculos y la regla de qué falta para enviarlo a revisión.
 *
 * Los cálculos viven aquí y no en el Excel. El TMEF, las horas restantes y la
 * fecha tentativa se quitaron a pedido de Confiabilidad (2026-11-18).
 */

import {
  EstructuraDeMedicion,
  hayMediciones,
  MinimoDeZona,
  ValoresDeMedicion,
} from './espesores';

export enum EstadoReporte {
  BORRADOR = 'borrador',
  PENDIENTE_REVISION = 'pendiente_revision',
  EMITIDO = 'emitido',
}

/** El formato trae cinco columnas de tareas. */
export const MAX_TAREAS = 5;
export const MAX_FOTOS = 12;
/** Anexos: las imágenes que no entran en la recopilación. Van al final del PDF. */
export const MAX_ANEXOS = 24;
/** Emisividad de la cámara FLIR: la que se usa casi siempre. */
export const EMISIVIDAD_POR_DEFECTO = 0.95;
export const MAX_RECOMENDACIONES = 10;

/** Fotos por fila: lo eligió Confiabilidad para la plantilla; arranca en 3. */
export const FOTOS_POR_FILA_POR_DEFECTO = 3;
/**
 * Con 6 por fila cada foto mide ~3 cm de ancho en A4: sirve para muchas fotos
 * de detalle, no para leer la escala de una termografía.
 */
export const FOTOS_POR_FILA_MAXIMO = 6;

/** `COTEM` + 137 → `COTEM-0137`, como el pie del formato. */
export function codigoInterno(
  codigoTecnica: string,
  correlativo: number,
): string {
  return `${codigoTecnica}-${String(correlativo).padStart(4, '0')}`;
}

// ── Antecedentes ──────────────────────────────────────────────────────────

export interface FichaDeAntecedentes {
  fabricante?: string;
  modelo?: string;
  /** Alcance de la bomba: el reporte nuevo lo toma de aquí. */
  alcance?: string;
  /** No sale en el reporte: queda para leer las horas de PI cuando se pueda. */
  tag_pi?: string;
  ot_modelo?: string;
  frecuencia_dias?: number;
}

export interface PiezaDeAntecedentes {
  pieza: string;
  proveedor?: string;
  material?: string;
  dureza_hb?: number;
  condicion_inicial?: string;
  espesor_nominal_mm?: number;
  espesor_precaucion_mm?: number;
  fecha_instalacion?: Date;
  /** Horas de operación de la pieza; sin dato si falta alguna hora del camino. */
  horas_trabajo?: number;
}

/**
 * Lo que el analista escribió de una pieza en el propio reporte. Un dato
 * vacío toma el de la ficha de la bomba; las horas, si no se escriben, se
 * calculan con las horas del día.
 */
export interface PiezaDelReporte {
  pieza: string;
  fecha_instalacion?: Date;
  proveedor?: string;
  condicion_inicial?: string;
  material?: string;
  horas_trabajo?: number;
}

export interface IntervencionDeAntecedentes {
  fecha: Date;
  tipo?: string;
  ot?: string;
  horas?: number;
  piezas: string[];
}

export interface InformeAnterior {
  id: string;
  codigo_interno?: string;
  fecha: Date;
}

/** Los mínimos por zona del último reporte emitido del tag con medición. */
export interface MedicionAnterior extends InformeAnterior {
  minimos: MinimoDeZona[];
}

/** Un diagrama del equipo con los puntos de medición (va en la plantilla). */
export interface DiagramaDeMedicion {
  archivo: string;
  descripcion: string;
  ancho?: number;
  alto?: number;
}

/**
 * La medición de espesores de un reporte: la grilla y los diagramas
 * **copiados de la plantilla al crearlo** (cambiar la plantilla no desarma
 * reportes viejos) y los valores que cargó el analista.
 */
export interface MedicionDelReporte {
  plantilla_id?: string;
  estructura: EstructuraDeMedicion;
  diagramas: DiagramaDeMedicion[];
  valores: ValoresDeMedicion;
}

/**
 * Lo que el reporte muestra en ANTECEDENTES, **copiado del momento**: si
 * mañana se cambia una pieza, este reporte sigue diciendo lo que se vio.
 */
export interface AntecedentesReporte {
  tomados_en: Date;
  ficha: FichaDeAntecedentes;
  componentes: PiezaDeAntecedentes[];
  ultima_intervencion?: IntervencionDeAntecedentes;
  informe_anterior?: InformeAnterior;
  medicion_anterior?: MedicionAnterior;
}

export interface EntradaAntecedentes {
  ahora: Date;
  /** Fecha del reporte. */
  fecha: Date;
  /** Horas desde la última intervención (el contador de PI que se reinicia). */
  horas?: number;
  ficha: FichaDeAntecedentes;
  componentes: Omit<PiezaDeAntecedentes, 'horas_trabajo'>[];
  intervenciones: IntervencionDeAntecedentes[];
  informeAnterior?: InformeAnterior;
  medicionAnterior?: MedicionAnterior;
  /** Las piezas como las dejó el analista en el reporte, si las tocó. */
  piezasDelReporte?: PiezaDelReporte[];
}

/** Sin las claves vacías: un dato vacío del reporte no tapa el de la ficha. */
function definidos<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ),
  ) as Partial<T>;
}

export function armarAntecedentes(e: EntradaAntecedentes): AntecedentesReporte {
  const hastaLaFecha = e.intervenciones
    .filter((i) => i.fecha.getTime() <= e.fecha.getTime())
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  const calcular = (c: Omit<PiezaDeAntecedentes, 'horas_trabajo'>) =>
    horasDePieza(c.fecha_instalacion, hastaLaFecha, e.horas);

  const delReporte = e.piezasDelReporte ?? [];
  const deLaFicha = new Map(e.componentes.map((c) => [c.pieza, c]));
  const componentes: PiezaDeAntecedentes[] =
    delReporte.length > 0
      ? delReporte.map(({ horas_trabajo, ...p }) => {
          // Lo de la ficha que el reporte no pide (dureza, espesores) se conserva.
          const pieza = { ...deLaFicha.get(p.pieza), ...definidos(p) } as Omit<
            PiezaDeAntecedentes,
            'horas_trabajo'
          >;
          return { ...pieza, horas_trabajo: horas_trabajo ?? calcular(pieza) };
        })
      : e.componentes.map((c) => ({ ...c, horas_trabajo: calcular(c) }));

  return {
    tomados_en: e.ahora,
    ficha: e.ficha,
    componentes,
    ultima_intervencion: hastaLaFecha[0],
    informe_anterior: e.informeAnterior,
    medicion_anterior: e.medicionAnterior,
  };
}

/**
 * Horas de operación de una pieza.
 *
 * El contador de PI se reinicia en cada intervención, así que una pieza
 * montada hace varias intervenciones suma las horas con que cerró cada
 * período posterior a su instalación, más las de ahora. La intervención del
 * día de la instalación **no** cuenta: sus horas son de la pieza anterior.
 *
 * Supone que «horas» son siempre desde la última intervención (pregunta 1 a
 * Confiabilidad). Si falta una sola hora en el camino, no hay dato: un número
 * a medias se leería como el real.
 */
export function horasDePieza(
  instalada: Date | undefined,
  intervenciones: IntervencionDeAntecedentes[],
  horasActuales: number | undefined,
): number | undefined {
  if (!instalada || horasActuales === undefined) return undefined;
  const posteriores = intervenciones.filter(
    (i) => i.fecha.getTime() > instalada.getTime(),
  );
  if (posteriores.some((i) => i.horas === undefined)) return undefined;
  return posteriores.reduce((suma, i) => suma + (i.horas ?? 0), horasActuales);
}

// ── Completitud ───────────────────────────────────────────────────────────

export interface TareaDeReporte {
  descripcion: string;
  grupo_trabajo?: string;
  ot?: string;
  prioridad?: string;
  comunicado_con?: string;
  semana?: string;
}

export interface ContenidoParaEnviar {
  tecnica?: string;
  resultado?: string;
  alcance?: string;
  emisividad?: number;
  analisis?: string;
  recomendaciones: string[];
  tareas: TareaDeReporte[];
  /** Con medición de espesores no se pide emisividad sino los valores. */
  medicion?: { valores: ValoresDeMedicion };
}

const vacio = (t?: string) => !t || t.trim() === '';

/**
 * Lo que falta para enviar a revisión. Un borrador se guarda incompleto; el
 * revisor recibe un reporte que se puede emitir.
 *
 * Las tareas siguen la regla impresa en el propio formato: «las descripciones
 * que llevan (*) deben ser llenadas obligatoriamente si existen
 * recomendaciones». Las marcadas son la descripción y «comunicado con».
 */
export function faltantesParaEnviar(r: ContenidoParaEnviar): string[] {
  const faltan: string[] = [];
  if (vacio(r.tecnica)) faltan.push('La técnica de monitoreo');
  if (vacio(r.alcance)) faltan.push('El alcance');
  if (r.medicion) {
    if (!hayMediciones(r.medicion.valores)) {
      faltan.push('Las mediciones de espesores');
    }
  } else if (r.emisividad === undefined) {
    faltan.push('La emisividad');
  }
  if (vacio(r.analisis)) faltan.push('El análisis y diagnóstico');
  if (vacio(r.resultado)) faltan.push('El resultado del análisis');

  const recomendaciones = r.recomendaciones.filter((x) => !vacio(x));
  if (recomendaciones.length > 0) {
    if (r.tareas.length === 0) {
      faltan.push('Al menos una tarea, porque hay recomendaciones');
    }
    r.tareas.forEach((t, i) => {
      if (vacio(t.descripcion))
        faltan.push(`La descripción de la tarea ${i + 1}`);
      if (vacio(t.comunicado_con)) {
        faltan.push(`Con quién se comunicó o coordinó la tarea ${i + 1}`);
      }
    });
  }
  return faltan;
}
