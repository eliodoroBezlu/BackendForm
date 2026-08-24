import { normalizarNombre } from '../../../common/utils/nombres-organizacion.util';

/**
 * Cómo llama el inventario a cada área frente a cómo se llama en el maestro.
 *
 * Es una tabla explícita a propósito. La alternativa —emparejar por parecido—
 * ya se probó en el sync del IAM y eligió mal: «Generación» tiene dos áreas
 * candidatas y la de más parecido textual era la que no tiene a nadie. Aquí un
 * error no se nota hasta que alguien inspecciona el arnés equivocado, así que
 * cada equivalencia se declara o no se resuelve.
 *
 * La clave va normalizada (mayúsculas, sin tildes); el valor es el `nombre`
 * exacto del área en el maestro.
 */
export const ALIAS_AREA: Record<string, string> = {
  // El inventario conserva el nombre viejo del taller.
  'TALLER GENERAL': 'Taller Soldadura',
  // Recursos Hídricos y Vías Férreas son una sola área para el IAM (3311); el
  // inventario las nombra juntas. El texto original se guarda como `subarea`.
  'RECURSOS HIDRICOS Y VIAS FERREAS': 'Recursos Hidricos',
  'VIAS FERREAS': 'Recursos Hidricos',
  'RECURSOS HIDRICOS': 'Recursos Hidricos',
  // Los SPCC de personal de oficina.
  OFICINAS: 'Oficina Mantenimiento',
  // Diferencias de tilde entre el inventario y el maestro.
  GENERACION: 'Generacion',
  INSTRUMENTACION: 'Instrumentacion',
  PLANIFICACION: 'Planificacion',
  LUBRICACION: 'Lubricacion',
  FLOTACION: 'Flotacion',
  ELECTRICO: 'Electrico',
  CHANCADO: 'Chancado',
  MOLIENDA: 'Molienda',
  FILTROS: 'Filtros',
  CONFIABILIDAD: 'Confiabilidad',
};

/**
 * Valores de la columna `Area` que no nombran un área sino un **cargo**.
 *
 * La hoja de vehículos los usa para la camioneta del gerente y las de los
 * superintendentes: no están «en Chancado», están con la persona. Cada uno
 * marca a qué nivel de la jerarquía sube el equipo.
 */
export const CENTINELA_GERENCIA = 'GERENTE';
export const CENTINELA_SUPERINTENDENCIA = 'SUPERINTENDENTE';

/** El área del maestro que le corresponde a un texto del inventario. */
export function nombreAreaMaestro(textoInventario: string): string {
  const clave = normalizarNombre(textoInventario);
  return ALIAS_AREA[clave] ?? textoInventario.trim();
}
