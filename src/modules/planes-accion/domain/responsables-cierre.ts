/**
 * Una tarea puede tener varios responsables de área para el cierre.
 *
 * La lista vive en `responsablesAreaCierreUsernames`. Los campos de uno solo
 * se mantienen para no migrar nada: `responsableAreaCierre` guarda los
 * nombres separados por coma (lo leen la tabla, el Excel y el historial) y
 * `responsableAreaCierreUsername` el primero de la lista (lo leían las tareas
 * de antes).
 *
 * TypeScript puro, sin Mongoose: se prueba sin base de datos.
 */

export interface ConResponsablesDeCierre {
  responsableAreaCierreUsername?: string;
  responsablesAreaCierreUsernames?: string[];
}

/** Quiénes reciben la tarea: la lista o, en una tarea de antes, el único. */
export const usuariosDeCierre = (tarea: ConResponsablesDeCierre): string[] => {
  if (tarea.responsablesAreaCierreUsernames?.length) {
    return tarea.responsablesAreaCierreUsernames;
  }
  return tarea.responsableAreaCierreUsername
    ? [tarea.responsableAreaCierreUsername]
    : [];
};

/**
 * Si los cambios traen la lista, la limpia (sin vacíos ni repetidos) y deja
 * el campo de uno solo en el primero. Sin lista, no toca nada.
 */
export function conResponsablesDeCierre<T extends ConResponsablesDeCierre>(
  cambios: T,
): T {
  if (!Array.isArray(cambios.responsablesAreaCierreUsernames)) return cambios;
  const lista = [
    ...new Set(
      cambios.responsablesAreaCierreUsernames
        .map((u) => u.trim())
        .filter((u) => u !== ''),
    ),
  ];
  return {
    ...cambios,
    responsablesAreaCierreUsernames: lista,
    responsableAreaCierreUsername: lista[0] ?? '',
  };
}
