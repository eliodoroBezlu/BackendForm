/**
 * Qué hace la carga de la planilla de seguimiento (1.02.P06.F41) con cada
 * fila: qué cambia en su tarea, qué se ignora y por qué se rechaza.
 *
 * La planilla que se sube es la misma que se descarga, editada. Cada fila
 * trae en una columna oculta el id de su tarea y su «versión» (cuántas
 * entradas tenía su historial al descargarla). Con eso:
 * - la fila llega a su tarea aunque se hayan ordenado las filas;
 * - si la tarea cambió en el sistema después de la descarga, la fila no se
 *   aplica: sus celdas sin tocar pisarían lo nuevo con lo viejo.
 *
 * Reglas (las mismas de la pantalla, ver `requisitos-tarea.ts`):
 * - Se actualizan la familia de peligro, la acción propuesta, los
 *   responsables de cierre y las dos fechas de cumplimiento.
 * - Los datos del hallazgo no se tocan: se corrigen con «Corregir tarea».
 * - El estado se deduce. Con fecha efectiva la tarea se cierra (si estaba
 *   abierta pasa antes por En progreso, en dos pasos); sin ella, una tarea
 *   abierta que ya tiene lo que pide En progreso pasa a En progreso. Nunca
 *   vuelve atrás: reabrir es una corrección del admin.
 * - Las evidencias se suben en el sistema: una tarea sin evidencia no se
 *   cierra desde la planilla.
 * - Las tareas aprobadas no se modifican y la planilla no crea tareas.
 *
 * TypeScript puro, sin Excel ni Mongoose: se prueba con objetos literales.
 */
import {
  type CambioDeCampo,
  cambiosDeTarea,
  faltantesParaEstado,
  mensajeDeFaltantes,
  NOMBRE_DEL_ESTADO,
  posicionDelEstado,
  type TareaConRequisitos,
} from './requisitos-tarea';

/** Lo que trae una fila de la planilla. Una fecha `null` no se entendió. */
export interface FilaDePlanilla {
  /** Número de fila en la hoja, para que la persona la encuentre. */
  fila: number;
  item?: number;
  tareaId?: string;
  version?: number;
  /** La fila tiene algo escrito en las columnas de la tarea. */
  tieneDatos: boolean;
  fechaHallazgo?: Date | null;
  responsableObservacion?: string;
  empresa?: string;
  lugarFisico?: string;
  actividad?: string;
  descripcionObservacion?: string;
  familiaPeligro?: string;
  accionPropuesta?: string;
  responsableAreaCierre?: string;
  fechaCumplimientoAcordada?: Date | null;
  fechaCumplimientoEfectiva?: Date | null;
}

export interface TareaDelPlan extends TareaConRequisitos {
  _id: string;
  activo?: boolean;
  aprobado?: boolean;
  estado?: string;
  responsableObservacion?: string;
  empresa?: string;
  lugarFisico?: string;
  actividad?: string;
  descripcionObservacion?: string;
  historial?: { fecha?: Date | string; usuario?: string }[];
}

/** Quien puede recibir una tarea como responsable de cierre. */
export interface ResponsableConocido {
  nomina: string;
  username: string;
}

export type ResultadoDeFila =
  | 'actualiza'
  | 'sin-cambios'
  | 'rechazada'
  | 'conflicto'
  | 'ignorada';

/** Lo que se le asigna a la tarea en un paso (cada paso va al historial). */
export type PasoDeCarga = Record<string, unknown>;

export interface FilaPlanificada {
  fila: number;
  item?: number;
  tareaId?: string;
  resultado: ResultadoDeFila;
  /** Por qué se rechaza, se ignora o choca. */
  motivo?: string;
  /** Lo que no se aplicó o lo que conviene saber, aunque la fila se aplique. */
  avisos: string[];
  /** Antes → después de todo lo que cambia, para la previsualización. */
  cambios: CambioDeCampo[];
  pasos: PasoDeCarga[];
}

/** Los datos del hallazgo, que la planilla no cambia. */
const CAMPOS_DEL_HALLAZGO: { campo: keyof FilaDePlanilla; nombre: string }[] = [
  { campo: 'fechaHallazgo', nombre: 'la fecha del hallazgo' },
  {
    campo: 'responsableObservacion',
    nombre: 'el responsable de la observación',
  },
  { campo: 'empresa', nombre: 'la empresa' },
  { campo: 'lugarFisico', nombre: 'el lugar físico' },
  { campo: 'actividad', nombre: 'la actividad' },
  { campo: 'descripcionObservacion', nombre: 'la descripción' },
];

const COLUMNA_DE_FECHA = {
  fechaCumplimientoAcordada: 'la fecha acordada (columna M)',
  fechaCumplimientoEfectiva: 'la fecha efectiva (columna N)',
} as const;

/** Sin tildes, sin mayúsculas y con los espacios colapsados. */
export const normalizar = (texto?: string): string =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** El día (UTC, como lo escribe y lo lee el Excel), o `''` sin fecha. */
const diaDe = (fecha?: Date | string | null): string => {
  if (!fecha) return '';
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const mismoTexto = (a?: string, b?: string) => normalizar(a) === normalizar(b);

/** «Juan Pérez, Ana López» → los responsables conocidos, o los que no se reconocen. */
function resolverResponsables(
  texto: string,
  conocidos: ResponsableConocido[],
): { elegidos: ResponsableConocido[]; desconocidos: string[] } {
  const porNombre = new Map(conocidos.map((r) => [normalizar(r.nomina), r]));
  const elegidos: ResponsableConocido[] = [];
  const desconocidos: string[] = [];
  for (const nombre of texto.split(/[,;\n]/)) {
    const limpio = nombre.trim();
    if (!limpio) continue;
    const r = porNombre.get(normalizar(limpio));
    if (!r) desconocidos.push(limpio);
    else if (!elegidos.includes(r)) elegidos.push(r);
  }
  return { elegidos, desconocidos };
}

/** El responsable conocido que comparte más palabras con el nombre escrito. */
function parecido(
  nombre: string,
  conocidos: ResponsableConocido[],
): string | undefined {
  const palabras = new Set(
    normalizar(nombre)
      .split(' ')
      .filter((p) => p.length > 2),
  );
  let mejor: { nomina: string; comunes: number } | undefined;
  for (const r of conocidos) {
    const comunes = normalizar(r.nomina)
      .split(' ')
      .filter((p) => palabras.has(p)).length;
    if (comunes >= 2 && (!mejor || comunes > mejor.comunes)) {
      mejor = { nomina: r.nomina, comunes };
    }
  }
  return mejor?.nomina;
}

const filaBase = (
  f: FilaDePlanilla,
): Pick<FilaPlanificada, 'fila' | 'item' | 'tareaId'> => ({
  fila: f.fila,
  item: f.item,
  tareaId: f.tareaId,
});

const rechazo = (
  f: FilaDePlanilla,
  resultado: 'rechazada' | 'conflicto' | 'ignorada',
  motivo: string,
  avisos: string[] = [],
): FilaPlanificada => ({
  ...filaBase(f),
  resultado,
  motivo,
  avisos,
  cambios: [],
  pasos: [],
});

const fechaCorta = (fecha?: Date | string) => {
  const d = fecha ? new Date(fecha) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })
    : '';
};

/** Lo que la fila pide cambiar en los campos que la planilla sí actualiza. */
function camposCambiados(
  f: FilaDePlanilla,
  tarea: TareaDelPlan,
  responsables: ResponsableConocido[],
): { campos: Record<string, unknown> } | { error: string } {
  const campos: Record<string, unknown> = {};

  for (const campo of ['familiaPeligro', 'accionPropuesta'] as const) {
    if (!mismoTexto(f[campo], tarea[campo])) campos[campo] = f[campo] ?? '';
  }

  for (const campo of [
    'fechaCumplimientoAcordada',
    'fechaCumplimientoEfectiva',
  ] as const) {
    const valor = f[campo];
    if (valor === null) {
      return {
        error: `No se entiende ${COLUMNA_DE_FECHA[campo]}: escríbala como fecha (dd/mm/aaaa).`,
      };
    }
    if (diaDe(valor) !== diaDe(tarea[campo])) campos[campo] = valor;
  }

  if (!mismoTexto(f.responsableAreaCierre, tarea.responsableAreaCierre)) {
    const { elegidos, desconocidos } = resolverResponsables(
      f.responsableAreaCierre ?? '',
      responsables,
    );
    if (desconocidos.length > 0) {
      const detalle = desconocidos
        .map((n) => {
          const sugerido = parecido(n, responsables);
          return sugerido ? `«${n}» (¿quiso decir «${sugerido}»?)` : `«${n}»`;
        })
        .join(', ');
      return {
        error: `No se reconoce como responsable de cierre: ${detalle}. Tiene que ser un supervisor o superintendente con usuario en el sistema, escrito como en el sistema.`,
      };
    }
    campos.responsableAreaCierre = elegidos.map((r) => r.nomina).join(', ');
    campos.responsablesAreaCierreUsernames = elegidos.map((r) => r.username);
    campos.responsableAreaCierreUsername = elegidos[0]?.username ?? '';
  }

  return { campos };
}

/** A qué estado llega la tarea con lo que trae la fila, o por qué no puede. */
function estadoDestino(
  tarea: TareaDelPlan,
  conCambios: TareaConRequisitos,
  hoy: Date,
): { destino: string; aviso?: string } | { error: string } {
  const actual = tarea.estado ?? 'abierto';
  const conEfectiva = !!diaDe(conCambios.fechaCumplimientoEfectiva);

  if (actual === 'cerrado' && !conEfectiva) {
    return {
      error:
        'La tarea está cerrada y la fila no trae fecha efectiva. Para reabrirla use «Corregir tarea».',
    };
  }
  if (conEfectiva) return { destino: 'cerrado' };
  if (actual !== 'abierto') return { destino: actual };

  const faltan = faltantesParaEstado(conCambios, 'en-progreso', hoy);
  return faltan.length === 0
    ? { destino: 'en-progreso' }
    : {
        destino: 'abierto',
        aviso: `Queda Abierta. ${mensajeDeFaltantes('en-progreso', faltan)}`,
      };
}

function planificarFila(
  f: FilaDePlanilla,
  tarea: TareaDelPlan,
  responsables: ResponsableConocido[],
  hoy: Date,
): FilaPlanificada {
  const historial = tarea.historial ?? [];
  if (f.version === undefined) {
    return rechazo(
      f,
      'rechazada',
      'A la fila le falta su versión (columna oculta R). Descargue la planilla de nuevo.',
    );
  }
  if (f.version !== historial.length) {
    const ultimo = historial[historial.length - 1];
    const quien = ultimo
      ? ` (último cambio: ${ultimo.usuario ?? 'alguien'}, ${fechaCorta(ultimo.fecha)})`
      : '';
    return rechazo(
      f,
      'conflicto',
      `La tarea cambió en el sistema después de descargar la planilla${quien}. Descárguela de nuevo y vuelva a cargar sus cambios.`,
    );
  }

  const avisos = CAMPOS_DEL_HALLAZGO.filter(({ campo }) =>
    campo === 'fechaHallazgo'
      ? f.fechaHallazgo !== null &&
        diaDe(f.fechaHallazgo) !== diaDe(tarea.fechaHallazgo)
      : !mismoTexto(
          f[campo] as string | undefined,
          tarea[campo as keyof TareaDelPlan] as string | undefined,
        ),
  ).map(({ nombre }) => nombre);
  const avisosDelHallazgo =
    avisos.length > 0
      ? [
          `No se aplicó el cambio en ${avisos.join(', ')}: los datos del hallazgo se corrigen con «Corregir tarea».`,
        ]
      : [];

  const leidos = camposCambiados(f, tarea, responsables);
  if ('error' in leidos) {
    return rechazo(f, 'rechazada', leidos.error, avisosDelHallazgo);
  }
  const { campos } = leidos;

  if (tarea.aprobado) {
    return Object.keys(campos).length > 0
      ? rechazo(
          f,
          'ignorada',
          'La tarea ya está aprobada: no se modifica.',
          avisosDelHallazgo,
        )
      : {
          ...filaBase(f),
          resultado: 'sin-cambios',
          avisos: avisosDelHallazgo,
          cambios: [],
          pasos: [],
        };
  }

  // Una fila sin cambios no se toca: ni avanza una tarea que ya tenía todo y
  // nadie movió, ni se rechaza una de antes a la que le falte algo.
  if (Object.keys(campos).length === 0) {
    return {
      ...filaBase(f),
      resultado: 'sin-cambios',
      avisos: avisosDelHallazgo,
      cambios: [],
      pasos: [],
    };
  }

  const conCambios = { ...tarea, ...campos } as TareaConRequisitos;
  const estado = estadoDestino(tarea, conCambios, hoy);
  if ('error' in estado) {
    return rechazo(f, 'rechazada', estado.error, avisosDelHallazgo);
  }

  const faltan = faltantesParaEstado(conCambios, estado.destino, hoy);
  if (faltan.length > 0) {
    const sinEvidencia = faltan.includes('al menos una evidencia del cierre');
    return rechazo(
      f,
      'rechazada',
      mensajeDeFaltantes(estado.destino, faltan) +
        (sinEvidencia
          ? ' Las evidencias se suben en el sistema, no en la planilla.'
          : ''),
      avisosDelHallazgo,
    );
  }

  const actual = tarea.estado ?? 'abierto';
  const salto = posicionDelEstado(estado.destino) - posicionDelEstado(actual);
  const pasos: PasoDeCarga[] =
    salto === 2
      ? [{ ...campos, estado: 'en-progreso' }, { estado: estado.destino }]
      : salto === 1
        ? [{ ...campos, estado: estado.destino }]
        : [campos];

  const avisosDeFila = [
    ...avisosDelHallazgo,
    ...(estado.aviso ? [estado.aviso] : []),
    ...(salto === 2
      ? [
          `Pasa de ${NOMBRE_DEL_ESTADO.abierto} a ${NOMBRE_DEL_ESTADO.cerrado} en dos pasos (por ${NOMBRE_DEL_ESTADO['en-progreso']}).`,
        ]
      : []),
  ];

  const final = Object.assign({}, ...pasos) as Record<string, unknown>;
  return {
    ...filaBase(f),
    resultado: 'actualiza',
    avisos: avisosDeFila,
    cambios: cambiosDeTarea(tarea, final),
    pasos,
  };
}

/** Qué pasa con cada fila de la planilla. */
export function planificarCarga({
  filas,
  tareas,
  responsables,
  hoy = new Date(),
}: {
  filas: FilaDePlanilla[];
  tareas: TareaDelPlan[];
  responsables: ResponsableConocido[];
  hoy?: Date;
}): FilaPlanificada[] {
  const porId = new Map(tareas.map((t) => [String(t._id), t]));
  const vistas = new Map<string, number>();
  const resultado: FilaPlanificada[] = [];

  for (const f of filas) {
    if (!f.tareaId) {
      if (f.tieneDatos) {
        resultado.push(
          rechazo(
            f,
            'ignorada',
            'La fila no es de ninguna tarea del plan: la planilla no crea tareas. Agréguela en el sistema.',
          ),
        );
      }
      continue;
    }

    const repetida = vistas.get(f.tareaId);
    if (repetida !== undefined) {
      resultado.push(
        rechazo(
          f,
          'rechazada',
          `Es la misma tarea de la fila ${repetida}: se tomó solo esa.`,
        ),
      );
      continue;
    }
    vistas.set(f.tareaId, f.fila);

    const tarea = porId.get(f.tareaId);
    if (!tarea || tarea.activo === false) {
      resultado.push(
        rechazo(
          f,
          'rechazada',
          'La tarea ya no está en el plan (se dio de baja).',
        ),
      );
      continue;
    }

    resultado.push(planificarFila(f, tarea, responsables, hoy));
  }
  return resultado;
}
