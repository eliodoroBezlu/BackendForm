/**
 * Cuándo una inspección IRO/ISOP se puede dar por terminada.
 *
 * Hasta ahora toda inspección quedaba en «borrador» para siempre: el
 * formulario exigía todo antes de guardar y no había un paso de cierre. Ahora
 * se puede «Guardar avance» con lo que se tenga y «Terminar» solo cuando está
 * todo. El formulario ya lo valida, pero la regla vive aquí para que una
 * llamada directa a la API no termine una inspección a medias: al terminarla
 * se genera su plan de acción.
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

export const ESTADO_BORRADOR = 'borrador';
export const ESTADO_COMPLETADO = 'completado';

/** El orden en que avanza una inspección; nunca vuelve hacia atrás por edición. */
const ORDEN_DE_ESTADOS = [
  ESTADO_BORRADOR,
  ESTADO_COMPLETADO,
  'revisado',
  'aprobado',
];

export interface InspeccionPorTerminar {
  verificationList?: Map<string, string> | Record<string, string> | null;
  inspectionTeam?: { nombre?: string; cargo?: string; firma?: string }[];
  sections?: { questions?: { response?: string | number | null }[] }[];
  personalInvolucrado?: { nombre?: string; ci?: string }[];
}

export interface PlantillaPorTerminar {
  verificationFields?: { label: string; required?: boolean }[];
}

const vacio = (valor: unknown) =>
  valor === undefined || valor === null || String(valor).trim() === '';

const valorDe = (
  lista: InspeccionPorTerminar['verificationList'],
  clave: string,
): string | undefined => {
  if (!lista) return undefined;
  if (lista instanceof Map) return lista.get(clave);
  return lista[clave];
};

/**
 * Lo que le falta a la inspección para poder terminarla, en frases que se
 * pueden mostrar tal cual. Vacío: se puede terminar.
 */
export function faltantesParaTerminar(
  inspeccion: InspeccionPorTerminar,
  plantilla: PlantillaPorTerminar,
): string[] {
  const faltan: string[] = [];

  const sinResponder = (inspeccion.sections ?? []).reduce(
    (total, seccion) =>
      total + (seccion.questions ?? []).filter((p) => vacio(p.response)).length,
    0,
  );
  if (sinResponder > 0) {
    faltan.push(
      sinResponder === 1
        ? 'Falta responder 1 pregunta'
        : `Faltan responder ${sinResponder} preguntas`,
    );
  }

  const camposVacios = (plantilla.verificationFields ?? [])
    .filter((campo) => campo.required)
    .filter((campo) => vacio(valorDe(inspeccion.verificationList, campo.label)))
    .map((campo) => campo.label);
  if (camposVacios.length > 0) {
    faltan.push(
      `Faltan datos de la lista de verificación: ${camposVacios.join(', ')}`,
    );
  }

  const equipo = inspeccion.inspectionTeam ?? [];
  if (equipo.length === 0) {
    faltan.push('Falta el equipo de inspección');
  } else if (
    equipo.some((m) => vacio(m.nombre) || vacio(m.cargo) || vacio(m.firma))
  ) {
    faltan.push(
      'Falta completar el nombre, el cargo o la firma del equipo de inspección',
    );
  }

  if (
    (inspeccion.personalInvolucrado ?? []).some(
      (p) => vacio(p.nombre) || vacio(p.ci),
    )
  ) {
    faltan.push('Falta completar el nombre o el C.I. del personal involucrado');
  }

  return faltan;
}

/**
 * El estado con el que se guarda: el pedido, salvo que retroceda. Una
 * inspección terminada que se vuelve a editar sigue terminada, y su plan de
 * acción no se vuelve a generar.
 */
export function estadoAlGuardar(
  actual: string | undefined,
  pedido: string | undefined,
): string {
  const desde = ORDEN_DE_ESTADOS.indexOf(actual ?? ESTADO_BORRADOR);
  const hacia = ORDEN_DE_ESTADOS.indexOf(pedido ?? actual ?? ESTADO_BORRADOR);
  return ORDEN_DE_ESTADOS[Math.max(desde, hacia, 0)];
}

/** Si al guardar la inspección pasa de borrador a terminada: es cuando nace su plan. */
export const seTermina = (actual: string | undefined, nuevo: string): boolean =>
  (actual ?? ESTADO_BORRADOR) === ESTADO_BORRADOR && nuevo !== ESTADO_BORRADOR;
