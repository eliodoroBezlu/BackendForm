/**
 * Qué hacer en la ficha de la bomba con las piezas que el analista completó
 * en un reporte, cuando ese reporte se emite.
 *
 * Se aplica al emitir y no al guardar: a la ficha solo llega lo que ya pasó
 * por el revisor, y un borrador abandonado no la toca.
 *
 * Respeta la historia de la ficha (\`ComponenteEquipo\`): una pieza instalada en
 * otra fecha es una pieza **nueva** y la anterior se retira; nunca se pisa.
 */
import { PiezaDelReporte } from './reporte';

/** Lo que importa de la pieza montada hoy en la ficha. */
export interface PiezaVigente {
  id: string;
  pieza: string;
  fecha_instalacion?: Date;
  proveedor?: string;
  condicion_inicial?: string;
  material?: string;
}

export type CambioEnLaFicha =
  | { accion: 'crear'; pieza: string; datos: DatosDePieza }
  | { accion: 'actualizar'; pieza: string; id: string; datos: DatosDePieza }
  | {
      accion: 'reemplazar';
      pieza: string;
      /** La pieza vigente, que pasa a retirada en la fecha de la nueva. */
      id: string;
      datos: DatosDePieza;
    };

export interface DatosDePieza {
  fecha_instalacion?: Date;
  proveedor?: string;
  condicion_inicial?: string;
  material?: string;
}

const CAMPOS = [
  'proveedor',
  'condicion_inicial',
  'material',
] as const satisfies readonly (keyof DatosDePieza)[];

const lleno = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== '';

/** Mismo día (UTC): las fechas de instalación son días, no instantes. */
const mismoDia = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** Solo lo que el analista escribió (lo vacío en el reporte no borra la ficha). */
function escrito(p: PiezaDelReporte): DatosDePieza {
  const datos: DatosDePieza = {};
  if (p.fecha_instalacion)
    datos.fecha_instalacion = new Date(p.fecha_instalacion);
  for (const c of CAMPOS) if (lleno(p[c])) datos[c] = p[c];
  return datos;
}

export function cambiosEnLaFicha(
  delReporte: PiezaDelReporte[],
  vigentes: PiezaVigente[],
): CambioEnLaFicha[] {
  const cambios: CambioEnLaFicha[] = [];

  for (const p of delReporte) {
    const datos = escrito(p);
    if (Object.keys(datos).length === 0) continue; // no escribió nada de esta pieza
    const actual = vigentes.find((v) => v.pieza === p.pieza);

    if (!actual) {
      cambios.push({ accion: 'crear', pieza: p.pieza, datos });
      continue;
    }

    const nueva = datos.fecha_instalacion;
    const vieja = actual.fecha_instalacion;
    if (nueva && vieja && !mismoDia(nueva, vieja)) {
      // Una fecha anterior a la de la pieza montada es información vieja:
      // no se retrocede la ficha.
      if (nueva.getTime() < vieja.getTime()) continue;
      // Otra pieza: se completa con lo que mostraba el reporte (lo vacío
      // salía de la ficha) y la anterior se retira.
      cambios.push({
        accion: 'reemplazar',
        pieza: p.pieza,
        id: actual.id,
        datos: {
          ...Object.fromEntries(
            CAMPOS.filter((c) => lleno(actual[c])).map((c) => [c, actual[c]]),
          ),
          ...datos,
        },
      });
      continue;
    }

    // La misma pieza: solo lo que cambia.
    const diferente: DatosDePieza = {};
    if (nueva && !vieja) diferente.fecha_instalacion = nueva;
    for (const c of CAMPOS) {
      if (lleno(datos[c]) && datos[c] !== actual[c]) diferente[c] = datos[c];
    }
    if (Object.keys(diferente).length > 0) {
      cambios.push({
        accion: 'actualizar',
        pieza: p.pieza,
        id: actual.id,
        datos: diferente,
      });
    }
  }
  return cambios;
}
