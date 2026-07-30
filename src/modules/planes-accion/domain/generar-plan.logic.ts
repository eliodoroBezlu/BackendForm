/**
 * Reglas de puntaje/clasificación usadas para derivar un plan de acción a
 * partir de una instancia de inspección. Deliberadamente sin dependencias
 * de Mongoose ni de NestJS: solo TypeScript puro sobre DTOs planos, para
 * que `PlanesAccionService.generarPlanDesdeInstancia` se limite a
 * orquestar la carga de datos y la persistencia (`new Model(...).save()`).
 */

export interface TemplateSectionLike {
  _id?: { toString(): string } | string;
  title: string;
  isParent?: boolean;
  subsections?: TemplateSectionLike[];
}

export interface TemplateLike {
  name?: string;
  sections: TemplateSectionLike[];
}

export interface QuestionResponseLike {
  questionText: string;
  response: string | number;
  comment?: string;
}

export interface SectionResponseLike {
  sectionId: string;
  questions: QuestionResponseLike[];
}

export interface InstanceLike {
  createdAt?: Date;
  verificationList?: Map<string, string> | Record<string, string> | null;
  sections: SectionResponseLike[];
}

export interface GenerarPlanOpciones {
  incluirPuntaje3?: boolean;
  incluirSoloConComentario?: boolean;
}

export interface TareaGenerada {
  numeroItem: number;
  fechaHallazgo: Date;
  responsableObservacion: string;
  empresa: string;
  lugarFisico: string;
  actividad: string;
  familiaPeligro: string;
  descripcionObservacion: string;
  accionPropuesta: string;
  responsableAreaCierre: string;
  diasRetraso: number;
  estado: 'abierto';
  aprobado: false;
  instanceId: string;
  sectionId: string;
  sectionTitle: string;
  questionText: string;
}

export interface PlanMetadatosOrganizacionales {
  vicepresidencia: string;
  superintendenciaSenior: string;
  superintendencia: string;
  areaFisica: string;
  empresa: string;
}

export interface PlanGeneradoDesdeInstancia {
  metadatosOrganizacionales: PlanMetadatosOrganizacionales;
  tareas: TareaGenerada[];
}

function convertToMap(
  verificationList: InstanceLike['verificationList'],
): Map<string, string> {
  if (verificationList instanceof Map) {
    return verificationList;
  }
  if (typeof verificationList === 'object' && verificationList !== null) {
    return new Map(Object.entries(verificationList));
  }
  return new Map();
}

function crearMapaSecciones(
  sections: TemplateSectionLike[],
): Map<string, TemplateSectionLike> {
  const map = new Map<string, TemplateSectionLike>();

  const procesarSeccion = (section: TemplateSectionLike) => {
    if (!section.isParent && section._id) {
      map.set(section._id.toString(), section);
    }
    if (section.subsections?.length) {
      section.subsections.forEach(procesarSeccion);
    }
  };

  sections.forEach(procesarSeccion);
  return map;
}

export function extraerPuntaje(response: string | number): number | null {
  if (response === 'N/A') return null;

  const puntaje =
    typeof response === 'number' ? response : parseInt(response, 10);

  return isNaN(puntaje) ? null : puntaje;
}

export function requierePlanDeAccion(
  puntaje: number,
  comentario: string | undefined,
  opciones: GenerarPlanOpciones,
): boolean {
  const { incluirPuntaje3 = false, incluirSoloConComentario = true } = opciones;

  if (puntaje < 3) {
    if (incluirSoloConComentario) {
      return !!comentario && comentario.trim().length > 0;
    }
    return true;
  }

  if (puntaje === 3 && incluirPuntaje3) {
    return !!comentario && comentario.trim().length > 0;
  }

  return false;
}

export function determinarFamiliaPeligro(sectionTitle: string): string {
  const title = sectionTitle.toLowerCase();

  const familias: Record<string, string> = {
    altura: 'Trabajo en Altura',
    eléctric: 'Riesgo Eléctrico',
    confinado: 'Espacio Confinado',
    caliente: 'Trabajo en Caliente',
    aislamiento: 'Aislamiento de Energía',
    izaje: 'Izaje y Levante',
    sustancia: 'Sustancias Peligrosas',
    maquinaria: 'Uso de Maquinaria',
  };

  for (const [keyword, familia] of Object.entries(familias)) {
    if (title.includes(keyword)) {
      return familia;
    }
  }

  return 'Seguridad Industrial';
}

/**
 * Deriva las tareas de observación (y los metadatos organizacionales del
 * plan) a partir de una instancia + su template, aplicando las reglas de
 * puntaje/clasificación. Función pura — no hace I/O ni persiste nada; el
 * llamador decide qué hacer con el resultado (ej. construir y guardar el
 * documento Mongoose).
 */
export function generarTareasDesdeInstancia(
  instance: InstanceLike,
  template: TemplateLike,
  instanceId: string,
  opciones: GenerarPlanOpciones = {},
): PlanGeneradoDesdeInstancia {
  const sectionsMap = crearMapaSecciones(template.sections);
  const verificationMap = convertToMap(instance.verificationList);

  const vicepresidencia =
    verificationMap.get('Vicepresidencia') ||
    verificationMap.get('Gerencia') ||
    verificationMap.get('Gerencia / Vicepresidencia') ||
    'Vicepresidencia no especificada';

  const superintendenciaSenior =
    verificationMap.get('Superintendencia Senior') ||
    verificationMap.get('Superintendencia Sénior') ||
    verificationMap.get('Sup. Senior') ||
    'Superintendencia Senior no especificada';

  const superintendencia =
    verificationMap.get('Superintendencia') ||
    verificationMap.get('Sup.') ||
    'Superintendencia no especificada';

  const areaFisica =
    verificationMap.get('Área') ||
    verificationMap.get('Area') ||
    verificationMap.get('Área Física') ||
    verificationMap.get('Lugar') ||
    'Área no especificada';

  const empresa =
    verificationMap.get('Empresa') || verificationMap.get('Compañía') || 'MSC';

  const tareas: TareaGenerada[] = [];
  let numeroItem = 0;

  for (const section of instance.sections) {
    const sectionInfo = sectionsMap.get(section.sectionId);
    if (!sectionInfo) continue;

    for (const question of section.questions) {
      const puntaje = extraerPuntaje(question.response);
      if (puntaje === null) continue;

      const necesitaPlan = requierePlanDeAccion(
        puntaje,
        question.comment,
        opciones,
      );
      if (!necesitaPlan) continue;

      numeroItem++;

      tareas.push({
        numeroItem,
        fechaHallazgo: instance.createdAt || new Date(),
        responsableObservacion:
          verificationMap.get('Supervisor') || 'No asignado',
        empresa,
        lugarFisico: areaFisica,
        actividad: template.name || 'Actividad no especificada',
        familiaPeligro: determinarFamiliaPeligro(sectionInfo.title),
        descripcionObservacion: question.comment || question.questionText,
        // La acción propuesta viene vacía: el usuario la completa
        // manualmente con ayuda de las recomendaciones de ML.
        accionPropuesta: '',
        responsableAreaCierre:
          verificationMap.get('Supervisor') || 'No asignado',
        diasRetraso: 0,
        estado: 'abierto',
        aprobado: false,
        instanceId,
        sectionId: section.sectionId,
        sectionTitle: sectionInfo.title,
        questionText: question.questionText,
      });
    }
  }

  return {
    metadatosOrganizacionales: {
      vicepresidencia,
      superintendenciaSenior,
      superintendencia,
      areaFisica,
      empresa,
    },
    tareas,
  };
}
