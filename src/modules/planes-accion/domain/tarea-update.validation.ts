/**
 * Reglas de validación para la transición de estado / edición de una tarea
 * de un plan de acción. Sin dependencias de Mongoose: opera sobre objetos
 * planos y devuelve el resultado (error o actualización normalizada) para
 * que el llamador (`PlanesAccionService.updateTarea`) decida cómo mutar y
 * persistir el subdocumento.
 */

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
  fechaCumplimientoAcordada?: Date;
  fechaCumplimientoEfectiva?: Date;
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
  | 'cerrado-sin-fecha';

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

    if (updateDto.estado === 'en-progreso') {
      if (
        !tareaConCambios.familiaPeligro ||
        !tareaConCambios.accionPropuesta ||
        !tareaConCambios.responsableAreaCierre ||
        !tareaConCambios.fechaCumplimientoAcordada
      ) {
        return {
          error: {
            type: 'en-progreso-incompleto',
            message:
              'Para pasar a "en-progreso", la tarea debe tener: Familia de Peligro, Acción Propuesta, Responsable y Fecha Acordada',
          },
          actualizacionProcesada,
        };
      }
    }

    if (updateDto.estado === 'cerrado') {
      if (!tareaConCambios.fechaCumplimientoEfectiva) {
        return {
          error: {
            type: 'cerrado-sin-fecha',
            message:
              'Para cerrar la tarea, debe tener una Fecha de Cumplimiento Efectiva',
          },
          actualizacionProcesada,
        };
      }
    }
  }

  return { actualizacionProcesada };
}
