import { Types } from 'mongoose';

/**
 * Un modelo de Mongoose en memoria, con lo justo que usa este módulo. Solo
 * para pruebas: `tsconfig.build.json` excluye esta carpeta.
 *
 * Respeta la baja lógica igual que el plugin: lo dado de baja no se ve salvo
 * con `incluirDadosDeBaja` o nombrando `activo` en el filtro.
 */

export type Registro = Record<string, unknown> & { _id: Types.ObjectId };
type Opciones = { incluirDadosDeBaja?: boolean };
type Orden = Record<string, 1 | -1>;
type Filtro = Record<string, unknown>;
interface Cambio {
  $set?: Record<string, unknown>;
  $push?: Record<string, unknown>;
  $inc?: Record<string, number>;
}

const aComparable = (v: unknown): unknown =>
  v instanceof Date ? v.getTime() : v instanceof Types.ObjectId ? String(v) : v;

export const igual = (a: unknown, b: unknown): boolean =>
  String(aComparable(a)) === String(aComparable(b));

function cumpleCondicion(valor: unknown, cond: unknown): boolean {
  if (
    !cond ||
    typeof cond !== 'object' ||
    cond instanceof Date ||
    cond instanceof Types.ObjectId
  ) {
    return igual(valor, cond);
  }
  return Object.entries(cond).every(([op, ref]) => {
    const v = aComparable(valor) as number;
    const r = aComparable(ref) as number;
    switch (op) {
      case '$in':
        return (ref as unknown[]).some((x) => igual(valor, x));
      case '$ne':
        return !igual(valor, ref);
      case '$lt':
        return valor !== undefined && v < r;
      case '$lte':
        return valor !== undefined && v <= r;
      case '$gte':
        return valor !== undefined && v >= r;
      default:
        throw new Error(`Operador no simulado: ${op}`);
    }
  });
}

const cumple = (doc: Registro, filtro: Filtro) =>
  Object.entries(filtro).every(([campo, cond]) =>
    cumpleCondicion(doc[campo], cond),
  );

function ordenar(docs: Registro[], orden?: Orden): Registro[] {
  if (!orden) return docs;
  return [...docs].sort((a, b) => {
    for (const [campo, sentido] of Object.entries(orden)) {
      const x = aComparable(a[campo]) as number | string;
      const y = aComparable(b[campo]) as number | string;
      if (x < y) return -sentido;
      if (x > y) return sentido;
    }
    return 0;
  });
}

class Consulta<T> implements PromiseLike<T> {
  private opciones: Opciones = {};
  private orden?: Orden;
  constructor(private readonly resolver: (o: Opciones, orden?: Orden) => T) {}
  setOptions(o: Opciones) {
    Object.assign(this.opciones, o);
    return this;
  }
  sort(orden: Orden) {
    this.orden = orden;
    return this;
  }
  select() {
    return this;
  }
  lean() {
    return this;
  }
  exec(): Promise<T> {
    try {
      return Promise.resolve(this.resolver(this.opciones, this.orden));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  then<A, B>(
    ok?: (v: T) => A | PromiseLike<A>,
    error?: (e: unknown) => B | PromiseLike<B>,
  ) {
    return this.exec().then(ok, error);
  }
}

function aplicar(doc: Registro, cambio: Cambio): void {
  for (const [ruta, valor] of Object.entries(cambio.$set ?? {})) {
    const [campo, sub] = ruta.split(/\.(.+)/);
    if (sub === undefined) doc[campo] = valor;
    else doc[campo] = { ...(doc[campo] as object), [sub]: valor };
  }
  for (const [campo, valor] of Object.entries(cambio.$push ?? {})) {
    doc[campo] = [...((doc[campo] as unknown[]) ?? []), valor];
  }
  for (const [campo, n] of Object.entries(cambio.$inc ?? {})) {
    doc[campo] = ((doc[campo] as number) ?? 0) + n;
  }
}

export class ModeloEnMemoria {
  docs: Registro[] = [];

  /** Campos únicos: un alta o `upsert` que los repite falla como Mongo (11000). */
  constructor(private readonly unicos: string[][] = []) {}

  private alta(datos: Record<string, unknown>): Registro {
    const doc: Registro = { activo: true, ...datos, _id: new Types.ObjectId() };
    for (const campos of this.unicos) {
      if (this.docs.some((d) => campos.every((c) => igual(d[c], doc[c])))) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
    }
    Object.defineProperty(doc, 'set', {
      value: (a: string | Record<string, unknown>, b?: unknown) => {
        if (typeof a === 'string') doc[a] = b;
        else Object.assign(doc, a);
        return doc;
      },
    });
    Object.defineProperty(doc, 'save', { value: () => Promise.resolve(doc) });
    Object.defineProperty(doc, 'toObject', { value: () => ({ ...doc }) });
    this.docs.push(doc);
    return doc;
  }

  private visibles(filtro: Filtro, o: Opciones) {
    return this.docs.filter(
      (d) =>
        (o.incluirDadosDeBaja || 'activo' in filtro || d.activo !== false) &&
        cumple(d, filtro),
    );
  }

  find = (filtro: Filtro = {}) =>
    new Consulta((o, orden) => ordenar(this.visibles(filtro, o), orden));
  findOne = (filtro: Filtro = {}) =>
    new Consulta(
      (o, orden) => ordenar(this.visibles(filtro, o), orden)[0] ?? null,
    );
  findById = (id: unknown) => this.findOne({ _id: id });
  exists = (filtro: Filtro) =>
    new Consulta((o) => (this.visibles(filtro, o).length ? {} : null));
  create = (datos: Record<string, unknown>) =>
    Promise.resolve(this.alta(datos));
  insertMany = (lista: Record<string, unknown>[]) =>
    Promise.resolve(lista.map((d) => this.alta(d)));

  updateOne = (
    filtro: Filtro,
    cambio: Cambio,
    opciones: { upsert?: boolean } = {},
  ) =>
    new Consulta((o) => {
      this.actualizar(filtro, cambio, o, opciones.upsert);
      return {};
    });

  findOneAndUpdate = (
    filtro: Filtro,
    cambio: Cambio,
    opciones: { upsert?: boolean } = {},
  ) => new Consulta((o) => this.actualizar(filtro, cambio, o, opciones.upsert));

  private actualizar(
    filtro: Filtro,
    cambio: Cambio,
    o: Opciones,
    upsert?: boolean,
  ) {
    const doc = this.visibles(filtro, o)[0];
    if (doc) {
      aplicar(doc, cambio);
      return doc;
    }
    if (!upsert) return null;
    const igualdades = Object.fromEntries(
      Object.entries(filtro).filter(
        ([, v]) => v === null || typeof v !== 'object' || v instanceof Date,
      ),
    );
    const nuevo = this.alta(igualdades);
    aplicar(nuevo, cambio);
    return nuevo;
  }
}
