/**
 * Plan de sincronización del padrón: compara las fichas del IAM (la fuente de
 * verdad) con la copia de forms y dice qué haría sincronizar, sin escribir.
 *
 * Es TypeScript puro para poder probarlo sin base de datos; el servicio lee,
 * llama a `planificar` y escribe lo que el admin eligió.
 *
 * Reglas que respeta (las mismas que la sincronización anterior):
 *  - Se empareja por el id de la ficha del IAM; si una ficha vieja de forms no
 *    lo tiene, por la CI.
 *  - Un dato vacío en el IAM no borra el de forms.
 *  - Nada se borra: una baja deja la ficha inactiva.
 */

/** Ficha tal como la entrega `GET /api/rbac/trabajadores` del IAM. */
export interface FichaIam {
  id: string;
  ci: string | null;
  nomina: string;
  puesto: string;
  superintendencia: string;
  area: string | null;
  jde: string | null;
  celular: string | null;
  residencia: string | null;
  noBloque: string | null;
  noHabitacion: string | null;
  fechaIngreso: string | null;
  tieneAccesoSistema: boolean;
  activo: boolean;
  username: string | null;
}

/** Lo que importa de un trabajador de forms (incluidos los dados de baja). */
export interface FichaLocal {
  id: string;
  iam_trabajador_id?: string | null;
  ci?: string | null;
  nomina: string;
  puesto: string;
  superintendencia: string;
  area: string;
  jde?: string | null;
  celular?: string | null;
  residencia?: string | null;
  no_bloque?: string | null;
  no_habitacion?: string | null;
  fecha_ingreso?: Date | string | null;
  username?: string | null;
  tiene_acceso_sistema?: boolean;
  /** `false` = dado de baja. Sin el campo (documentos viejos) cuenta como activo. */
  activo?: boolean;
  roles_iam?: string[];
}

export interface CambioDeCampo {
  campo: string;
  etiqueta: string;
  antes: string;
  despues: string;
}

export type TipoDeItem = 'nuevo' | 'cambio' | 'baja' | 'problema';

export interface ItemDelPlan {
  /** Id de la ficha en el IAM: es lo que el admin elige. */
  idIam: string;
  /** Id del trabajador en forms, si ya existe. */
  idLocal?: string;
  tipo: TipoDeItem;
  nomina: string;
  ci: string | null;
  puesto: string;
  cambios: CambioDeCampo[];
  /** Por qué es una baja o un problema. */
  motivo?: string;
  /** Campos a escribir en forms (nuevos y cambios). */
  datos?: Record<string, unknown>;
}

export interface PlanDeSincronizacion {
  nuevos: ItemDelPlan[];
  conCambios: ItemDelPlan[];
  bajas: ItemDelPlan[];
  problemas: ItemDelPlan[];
  sinCambios: number;
}

export interface PersonaDelRol {
  idIam: string;
  nomina: string;
}

export interface PlanDeRol {
  rol: string;
  ganan: PersonaDelRol[];
  pierden: PersonaDelRol[];
}

/** Campos de texto que se copian del IAM, con su nombre para mostrar. */
const CAMPOS: Array<{
  local: keyof FichaLocal;
  etiqueta: string;
  delIam: (t: FichaIam) => string | null;
}> = [
  { local: 'nomina', etiqueta: 'Nómina', delIam: (t) => t.nomina },
  { local: 'ci', etiqueta: 'CI', delIam: (t) => t.ci },
  { local: 'puesto', etiqueta: 'Puesto', delIam: (t) => t.puesto },
  {
    local: 'superintendencia',
    etiqueta: 'Superintendencia',
    delIam: (t) => t.superintendencia,
  },
  { local: 'area', etiqueta: 'Área', delIam: (t) => t.area },
  { local: 'jde', etiqueta: 'JDE', delIam: (t) => t.jde },
  { local: 'celular', etiqueta: 'Celular', delIam: (t) => t.celular },
  { local: 'residencia', etiqueta: 'Residencia', delIam: (t) => t.residencia },
  { local: 'no_bloque', etiqueta: 'Bloque', delIam: (t) => t.noBloque },
  {
    local: 'no_habitacion',
    etiqueta: 'Habitación',
    delIam: (t) => t.noHabitacion,
  },
  { local: 'username', etiqueta: 'Usuario', delIam: (t) => t.username },
];

/** Texto comparable: los campos son cadenas; cualquier otra cosa cuenta como vacío. */
const texto = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

const fecha = (v: Date | string | null | undefined): string => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const siNo = (v: boolean) => (v ? 'Sí' : 'No');

const estaActiva = (l: FichaLocal) => l.activo !== false;

/** Índices de las fichas de forms para emparejar rápido. */
function indexar(locales: FichaLocal[]) {
  const porIdIam = new Map<string, FichaLocal>();
  const porCiSinVincular = new Map<string, FichaLocal>();
  const porCi = new Map<string, FichaLocal>();
  for (const l of locales) {
    if (l.iam_trabajador_id) porIdIam.set(l.iam_trabajador_id, l);
    const ci = texto(l.ci);
    if (ci) {
      porCi.set(ci, l);
      if (!l.iam_trabajador_id) porCiSinVincular.set(ci, l);
    }
  }
  return { porIdIam, porCiSinVincular, porCi };
}

function emparejar(
  t: FichaIam,
  indice: ReturnType<typeof indexar>,
): FichaLocal | undefined {
  return (
    indice.porIdIam.get(t.id) ??
    (texto(t.ci) ? indice.porCiSinVincular.get(texto(t.ci)) : undefined)
  );
}

function base(t: FichaIam, tipo: TipoDeItem, local?: FichaLocal): ItemDelPlan {
  return {
    idIam: t.id,
    idLocal: local?.id,
    tipo,
    nomina: texto(t.nomina) || texto(local?.nomina),
    ci: texto(t.ci) || texto(local?.ci) || null,
    puesto: texto(t.puesto) || texto(local?.puesto),
    cambios: [],
  };
}

/** La CI del IAM ya la usa otra ficha de forms: hay que corregirla en el IAM. */
function conflictoDeCi(
  t: FichaIam,
  local: FichaLocal | undefined,
  indice: ReturnType<typeof indexar>,
): string | undefined {
  const ci = texto(t.ci);
  if (!ci) return undefined;
  const otra = indice.porCi.get(ci);
  if (!otra || otra === local || otra.iam_trabajador_id === t.id) {
    return undefined;
  }
  return `La CI ${ci} ya la tiene ${otra.nomina} en forms. Corregila en el Portal IAM.`;
}

/** Cambios de una ficha existente; `datos` trae solo lo que cambia. */
function compararConLocal(t: FichaIam, local: FichaLocal) {
  const cambios: CambioDeCampo[] = [];
  const datos: Record<string, unknown> = {};

  if (local.iam_trabajador_id !== t.id) {
    // Ficha vieja emparejada por CI: queda vinculada al IAM.
    datos.iam_trabajador_id = t.id;
    cambios.push({
      campo: 'iam_trabajador_id',
      etiqueta: 'Ficha del IAM',
      antes: 'Sin vincular',
      despues: 'Vinculada',
    });
  }

  for (const c of CAMPOS) {
    const nuevo = texto(c.delIam(t));
    const actual = texto(local[c.local]);
    if (nuevo && nuevo !== actual) {
      datos[c.local] = nuevo;
      cambios.push({
        campo: c.local,
        etiqueta: c.etiqueta,
        antes: actual || '—',
        despues: nuevo,
      });
    }
  }

  const ingresoIam = fecha(t.fechaIngreso);
  const ingresoLocal = fecha(local.fecha_ingreso);
  if (ingresoIam && ingresoIam !== ingresoLocal) {
    datos.fecha_ingreso = new Date(t.fechaIngreso as string);
    cambios.push({
      campo: 'fecha_ingreso',
      etiqueta: 'Fecha de ingreso',
      antes: ingresoLocal || '—',
      despues: ingresoIam,
    });
  }

  const accesoLocal = local.tiene_acceso_sistema ?? false;
  if (t.tieneAccesoSistema !== accesoLocal) {
    datos.tiene_acceso_sistema = t.tieneAccesoSistema;
    cambios.push({
      campo: 'tiene_acceso_sistema',
      etiqueta: 'Acceso al sistema',
      antes: siNo(accesoLocal),
      despues: siNo(t.tieneAccesoSistema),
    });
  }

  if (!estaActiva(local)) {
    // Dado de baja en forms pero activo en el IAM: vuelve.
    datos.activo = true;
    datos.eliminadaEn = null;
    datos.eliminadaPor = null;
    cambios.push({
      campo: 'activo',
      etiqueta: 'Estado',
      antes: 'Dado de baja',
      despues: 'Activo',
    });
  }

  return { cambios, datos };
}

/** Datos de una ficha nueva en forms (con los valores por defecto de siempre). */
function datosNuevos(t: FichaIam): Record<string, unknown> {
  return {
    iam_trabajador_id: t.id,
    ci: texto(t.ci) || undefined,
    nomina: texto(t.nomina),
    puesto: texto(t.puesto),
    fecha_ingreso: t.fechaIngreso ? new Date(t.fechaIngreso) : new Date(),
    superintendencia: texto(t.superintendencia) || 'Sin superintendencia',
    area: texto(t.area) || 'Sin área',
    jde: texto(t.jde) || undefined,
    celular: texto(t.celular) || undefined,
    residencia: texto(t.residencia) || undefined,
    no_bloque: texto(t.noBloque) || undefined,
    no_habitacion: texto(t.noHabitacion) || undefined,
    username: texto(t.username) || undefined,
    tiene_acceso_sistema: t.tieneAccesoSistema,
    activo: true,
  };
}

export function planificar(
  iam: FichaIam[],
  locales: FichaLocal[],
): PlanDeSincronizacion {
  const indice = indexar(locales);
  const plan: PlanDeSincronizacion = {
    nuevos: [],
    conCambios: [],
    bajas: [],
    problemas: [],
    sinCambios: 0,
  };
  const idsDelIam = new Set(iam.map((t) => t.id));

  for (const t of iam) {
    const local = emparejar(t, indice);

    if (!t.activo) {
      // Baja en el IAM: solo importa si en forms sigue activa.
      if (local && estaActiva(local)) {
        plan.bajas.push({
          ...base(t, 'baja', local),
          motivo: 'Dado de baja en el Portal IAM',
          cambios: [
            {
              campo: 'activo',
              etiqueta: 'Estado',
              antes: 'Activo',
              despues: 'Dado de baja',
            },
          ],
        });
      }
      continue;
    }

    const conflicto = conflictoDeCi(t, local, indice);
    if (conflicto) {
      plan.problemas.push({ ...base(t, 'problema', local), motivo: conflicto });
      continue;
    }

    if (!local) {
      const faltan = [
        !texto(t.nomina) && 'la nómina',
        !texto(t.puesto) && 'el puesto',
      ].filter(Boolean);
      if (faltan.length) {
        plan.problemas.push({
          ...base(t, 'problema'),
          motivo: `Falta ${faltan.join(' y ')} en el Portal IAM.`,
        });
        continue;
      }
      plan.nuevos.push({ ...base(t, 'nuevo'), datos: datosNuevos(t) });
      continue;
    }

    const { cambios, datos } = compararConLocal(t, local);
    if (cambios.length === 0) {
      plan.sinCambios++;
    } else {
      plan.conCambios.push({ ...base(t, 'cambio', local), cambios, datos });
    }
  }

  // Fichas vinculadas a una ficha del IAM que ya no existe.
  for (const l of locales) {
    if (
      l.iam_trabajador_id &&
      !idsDelIam.has(l.iam_trabajador_id) &&
      estaActiva(l)
    ) {
      plan.bajas.push({
        idIam: l.iam_trabajador_id,
        idLocal: l.id,
        tipo: 'baja',
        nomina: texto(l.nomina),
        ci: texto(l.ci) || null,
        puesto: texto(l.puesto),
        motivo: 'Ya no está en el Portal IAM',
        cambios: [
          {
            campo: 'activo',
            etiqueta: 'Estado',
            antes: 'Activo',
            despues: 'Dado de baja',
          },
        ],
      });
    }
  }

  return plan;
}

/**
 * Quién gana o pierde un rol de forms (p. ej. supervisor). `conRolEnIam` son
 * las fichas del IAM de los usuarios con ese rol en el servicio forms.
 */
export function planificarRol(
  rol: string,
  conRolEnIam: PersonaDelRol[],
  locales: FichaLocal[],
): PlanDeRol {
  const conRol = new Set(conRolEnIam.map((p) => p.idIam));
  const indice = indexar(locales);

  const ganan = conRolEnIam.filter(
    (p) => !(indice.porIdIam.get(p.idIam)?.roles_iam ?? []).includes(rol),
  );
  const pierden = locales
    .filter((l) => (l.roles_iam ?? []).includes(rol))
    .filter((l) => !l.iam_trabajador_id || !conRol.has(l.iam_trabajador_id))
    .map((l) => ({
      idIam: l.iam_trabajador_id ?? '',
      nomina: texto(l.nomina),
    }));

  return { rol, ganan, pierden };
}
