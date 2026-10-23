/**
 * Reglas de validación para la transición de estado / edición de una tarea
 * de un plan de acción. Sin dependencias de Mongoose: opera sobre objetos
 * planos y devuelve el resultado (error o actualización normalizada) para
 * que el llamador (`PlanesAccionService.updateTarea`) decida cómo mutar y
 * persistir el subdocumento.
 *
 * Qué datos exige cada estado vive en `requisitos-tarea.ts` (lo comparte con
 * la corrección del admin). Aquí se agrega el orden: por esta vía una tarea
 * solo avanza, de a un paso. Volver atrás es una corrección del admin.
 */
import {
  faltantesParaEstado,
  mensajeDeFaltantes,
  NOMBRE_DEL_ESTADO,
  posicionDelEstado,
} from './requisitos-tarea';

export const CAMPOS_BLOQUEADOS_DESDE_INSPECCION = [
  'fechaHallazgo',
  'responsableObservacion',
  'empresa',
  'lugarFisico',
  'actividad',
  'descripcionObservacion',
];

export interface TareaActualLike {
  aprobado: boolean;
  instanceId?: string;
  estado: string;
  familiaPeligro?: string;
  accionPropuesta?: string;
  responsableAreaCierre?: string;
  fechaHallazgo?: Date;
  fechaCumplimientoAcordada?: Date;
  fechaCumplimientoEfectiva?: Date;
  evidencias?: EvidenciaInput[];
}

export interface EvidenciaInput {
  nombre?: string;
  url?: string;
}

export interface MLMetadataInput {
  fue_recomendacion_ml?: boolean;
  indice_recomendacion?: number;
  recomendaciones_originales?: string[];
}

export interface TareaUpdateRequest {
  estado?: string;
  fechaCumplimientoAcordada?: string | Date;
  fechaCumplimientoEfectiva?: string | Date;
  evidencias?: EvidenciaInput[];
  mlMetadata?: MLMetadataInput;
}

export type TareaUpdateErrorType =
  | 'aprobada'
  | 'campos-bloqueados'
  | 'en-progreso-incompleto'
  | 'cerrado-incompleto'
  | 'retroceso'
  | 'salto';

export interface TareaUpdateError {
  type: TareaUpdateErrorType;
  message: string;
}

export interface TareaUpdateValidationResult {
  error?: TareaUpdateError;
  /** Campos ya normalizados (fechas parseadas, evidencias saneadas) listos para aplicar con Object.assign. */
  actualizacionProcesada: Record<string, unknown>;
}

/**
 * Valida una solicitud de actualización de tarea contra su estado actual y
 * normaliza los campos (fechas, evidencias). No ejecuta I/O ni conoce
 * Mongoose — devuelve un resultado que el servicio aplica y persiste.
 */
export function validarActualizacionTarea(
  tareaActual: TareaActualLike,
  updateDto: TareaUpdateRequest,
): TareaUpdateValidationResult {
  if (tareaActual.aprobado) {
    return {
      error: {
        type: 'aprobada',
        message: 'No se puede editar una tarea aprobada',
      },
      actualizacionProcesada: {},
    };
  }

  // Campos bloqueados para tareas generadas desde inspección.
  if (tareaActual.instanceId) {
    const camposEnviados = Object.keys(updateDto);
    const intentoCambiarBloqueado = camposEnviados.some((campo) =>
      CAMPOS_BLOQUEADOS_DESDE_INSPECCION.includes(campo),
    );

    if (intentoCambiarBloqueado) {
      return {
        error: {
          type: 'campos-bloqueados',
          message: `No se pueden modificar los siguientes campos en tareas generadas desde inspección: ${CAMPOS_BLOQUEADOS_DESDE_INSPECCION.join(', ')}`,
        },
        actualizacionProcesada: {},
      };
    }
  }

  const actualizacionProcesada: Record<string, unknown> = { ...updateDto };
  // Aprobar es de `approveTarea` (con su rol): por aquí no se aprueba.
  delete actualizacionProcesada.aprobado;

  if (updateDto.fechaCumplimientoAcordada) {
    actualizacionProcesada.fechaCumplimientoAcordada = new Date(
      updateDto.fechaCumplimientoAcordada,
    );
  }
  if (updateDto.fechaCumplimientoEfectiva) {
    actualizacionProcesada.fechaCumplimientoEfectiva = new Date(
      updateDto.fechaCumplimientoEfectiva,
    );
  }
  if (updateDto.evidencias !== undefined) {
    actualizacionProcesada.evidencias = updateDto.evidencias
      .filter((ev) => ev && ev.nombre && ev.url)
      .map((ev) => ({
        nombre: String(ev.nombre).trim(),
        url: String(ev.url).trim(),
      }));
  }

  if (updateDto.estado) {
    const tareaConCambios: TareaActualLike = {
      ...tareaActual,
      ...actualizacionProcesada,
    } as TareaActualLike;

    const desde = posicionDelEstado(tareaActual.estado);
    const hacia = posicionDelEstado(updateDto.estado);
    if (hacia < desde) {
      return {
        error: {
          type: 'retroceso',
          message: `Una tarea en ${NOMBRE_DEL_ESTADO[tareaActual.estado]} no vuelve a ${NOMBRE_DEL_ESTADO[updateDto.estado]}: solo el administrador puede corregirla.`,
        },
        actualizacionProcesada,
      };
    }
    if (hacia - desde > 1) {
      return {
        error: {
          type: 'salto',
          message:
            'La tarea tiene que pasar por En progreso antes de cerrarse.',
        },
        actualizacionProcesada,
      };
    }

    const faltan = faltantesParaEstado(tareaConCambios, updateDto.estado);
    if (faltan.length > 0) {
      return {
        error: {
          type:
            updateDto.estado === 'cerrado'
              ? 'cerrado-incompleto'
              : 'en-progreso-incompleto',
          message: mensajeDeFaltantes(updateDto.estado, faltan),
        },
        actualizacionProcesada,
      };
    }
  }

  return { actualizacionProcesada };
}
