import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  EstadoRevision,
  numeroDesdeTexto,
  textoDeRevision,
} from './versionado';
import { VersionadoPlantillas } from './versionado-plantillas';

describe('versionado · funciones puras', () => {
  it.each([
    ['Revisión: 7', 7],
    ['Rev. 1', 1],
    ['4', 4],
    ['R2 v11', 11],
    ['sin número', 1],
    ['', 1],
  ])('numeroDesdeTexto(%p) = %p', (texto, esperado) => {
    expect(numeroDesdeTexto(texto)).toBe(esperado);
  });

  it.each([
    ['Revisión: 7', 8, 'Revisión: 8'],
    ['Rev. 1', 2, 'Rev. 2'],
    ['4', 5, '5'],
    ['sin número', 2, 'Rev. 2'],
  ])('textoDeRevision(%p, %p) respeta el formato: %p', (texto, n, esperado) => {
    expect(textoDeRevision(texto, n)).toBe(esperado);
  });
});

/**
 * Modelo falso en memoria: lo que importa es el estado de la familia de
 * revisiones después de cada operación, así que las escrituras se aplican de
 * verdad. Imita la baja lógica (excluye `activo: false` salvo que se pida).
 */
type Doc = Record<string, unknown> & { _id: Types.ObjectId };

class Consulta<T> {
  private opciones: Record<string, unknown> = {};
  constructor(private readonly f: (o: Record<string, unknown>) => T) {}
  setOptions(o: Record<string, unknown>) {
    this.opciones = { ...this.opciones, ...o };
    return this;
  }
  sort() {
    return this;
  }
  select() {
    return this;
  }
  lean() {
    return this;
  }
  exec() {
    return Promise.resolve(this.f(this.opciones));
  }
}

const igual = (a: unknown, b: unknown) => String(a) === String(b);

function coincide(
  d: Doc,
  filtro: Record<string, unknown>,
  o: Record<string, unknown>,
) {
  if (!o.incluirDadosDeBaja && d.activo === false) return false;
  return Object.entries(filtro).every(([k, v]) => {
    const actual = d[k];
    if (v && typeof v === 'object' && !(v instanceof Types.ObjectId)) {
      const op = v as { $ne?: unknown; $nin?: unknown[] };
      if ('$ne' in op) return !igual(actual, op.$ne);
      if ('$nin' in op) return !(op.$nin ?? []).some((x) => igual(actual, x));
    }
    return igual(actual, v);
  });
}

function aplicar(d: Doc, update: Record<string, unknown>) {
  const { $set, $unset, ...resto } = update as {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
  };
  Object.assign(d, resto, $set ?? {});
  Object.keys($unset ?? {}).forEach((k) => delete d[k]);
}

function modeloFalso(inicial: Array<Record<string, unknown>>) {
  const conMetodos = (d: Record<string, unknown>): Doc => {
    const doc = { _id: new Types.ObjectId(), activo: true, ...d } as Doc;
    Object.defineProperty(doc, 'toObject', {
      value: () =>
        JSON.parse(JSON.stringify({ ...doc })) as Record<string, unknown>,
      enumerable: false,
    });
    return doc;
  };
  const docs: Doc[] = inicial.map(conMetodos);
  return {
    docs,
    findById: (id: unknown) =>
      new Consulta(
        (o) => docs.find((d) => coincide(d, { _id: id }, o)) ?? null,
      ),
    findOne: (f: Record<string, unknown>) =>
      new Consulta((o) => docs.find((d) => coincide(d, f, o)) ?? null),
    find: (f: Record<string, unknown>) =>
      new Consulta((o) => docs.filter((d) => coincide(d, f, o))),
    countDocuments: (f: Record<string, unknown>) =>
      new Consulta((o) => docs.filter((d) => coincide(d, f, o)).length),
    create: (d: Record<string, unknown>) => {
      const nuevo = conMetodos({ ...d, _id: undefined });
      nuevo._id = new Types.ObjectId();
      docs.push(nuevo);
      return Promise.resolve(nuevo);
    },
    updateOne: (f: Record<string, unknown>, u: Record<string, unknown>) =>
      new Consulta((o) => {
        const d = docs.find((x) => coincide(x, f, o));
        if (d) aplicar(d, u);
        return { modifiedCount: d ? 1 : 0 };
      }),
    findOneAndUpdate: (
      f: Record<string, unknown>,
      u: Record<string, unknown>,
    ) =>
      new Consulta((o) => {
        const d = docs.find((x) => coincide(x, f, o));
        if (d) aplicar(d, u);
        return d ?? null;
      }),
  };
}

describe('VersionadoPlantillas', () => {
  let modelo: ReturnType<typeof modeloFalso>;
  let usos: Map<string, number>;
  let versionado: VersionadoPlantillas<never>;
  let vigente: Doc;

  const porNumero = (n: number) =>
    modelo.docs.find((d) => d.numeroRevision === n) as Doc;

  beforeEach(() => {
    // ISOP con la Revisión 7 vigente (23 inspecciones) y la 6 obsoleta.
    modelo = modeloFalso([
      {
        code: 'F12',
        name: 'ISOP',
        revision: 'Revisión: 6',
        numeroRevision: 6,
        estadoRevision: EstadoRevision.OBSOLETA,
        sections: [{ title: 'A' }],
      },
      {
        code: 'F12',
        name: 'ISOP',
        revision: 'Revisión: 7',
        numeroRevision: 7,
        estadoRevision: EstadoRevision.VIGENTE,
        sections: [{ title: 'A' }, { title: 'B' }],
        publicadaPor: 'ana',
        motivoCambio: 'viejo',
      },
    ]);
    vigente = porNumero(7);
    usos = new Map([[String(vigente._id), 23]]);
    versionado = new VersionadoPlantillas(modelo as never, (id) =>
      Promise.resolve(usos.get(String(id)) ?? 0),
    );
  });

  describe('estadoEdicion', () => {
    it('una vigente con inspecciones no se edita: hay que crear revisión', async () => {
      const e = await versionado.estadoEdicion(String(vigente._id));
      expect(e).toMatchObject({
        editable: false,
        estado: 'vigente',
        inspecciones: 23,
      });
      expect(e.motivo).toMatch(/nueva revisión/);
    });

    it('una vigente sin inspecciones sí se edita', async () => {
      usos.clear();
      await expect(
        versionado.estadoEdicion(String(vigente._id)),
      ).resolves.toMatchObject({ editable: true });
    });

    it('una obsoleta nunca se edita', async () => {
      await expect(
        versionado.exigirEditable(String(porNumero(6)._id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('una plantilla anterior al versionado (sin estado) cuenta como vigente', async () => {
      delete vigente.estadoRevision;
      await expect(
        versionado.estadoEdicion(String(vigente._id)),
      ).resolves.toMatchObject({ estado: 'vigente' });
    });
  });

  describe('crearRevision', () => {
    it('una plantilla sin número guardado (antes de migrar) toma el número del texto', async () => {
      // Mongoose completa `numeroRevision` con el default (1) al hidratar un
      // documento que no lo tiene; por eso «Revisión: 7» producía «Revisión: 2».
      delete vigente.numeroRevision;
      delete porNumero(6)?.numeroRevision;
      modelo.docs.forEach((d) => delete d.numeroRevision);

      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;

      expect(borrador).toMatchObject({
        numeroRevision: 8,
        revision: 'Revisión: 8',
      });
    });

    it('clona la vigente como borrador de la siguiente, con el texto en el mismo formato', async () => {
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;

      expect(borrador).toMatchObject({
        code: 'F12',
        numeroRevision: 8,
        revision: 'Revisión: 8',
        estadoRevision: 'borrador',
        creadaPor: 'luis',
        sections: [{ title: 'A' }, { title: 'B' }],
      });
      expect(igual(borrador.revisionAnteriorId, vigente._id)).toBe(true);
      // No arrastra la publicación de la anterior.
      expect(borrador.publicadaPor).toBeUndefined();
      expect(borrador.motivoCambio).toBeUndefined();
      // La vigente no se toca.
      expect(vigente.estadoRevision).toBe('vigente');
    });

    it('no deja crear un segundo borrador mientras haya uno en preparación', async () => {
      await versionado.crearRevision(String(vigente._id), 'luis');
      await expect(
        versionado.crearRevision(String(vigente._id), 'luis'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('solo parte de la vigente', async () => {
      await expect(
        versionado.crearRevision(String(porNumero(6)._id), 'luis'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el número sigue al más alto de la familia, aunque ese esté dado de baja', async () => {
      const descartado = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;
      descartado.activo = false; // borrador descartado: ocupa el número 8

      const otro = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;
      expect(otro.numeroRevision).toBe(9);
    });
  });

  describe('publicar', () => {
    it('el borrador pasa a vigente y la anterior a obsoleta', async () => {
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;

      await versionado.publicar(
        String(borrador._id),
        ' se agregó la pregunta de arnés ',
        'ana',
      );

      expect(borrador).toMatchObject({
        estadoRevision: 'vigente',
        publicadaPor: 'ana',
        motivoCambio: 'se agregó la pregunta de arnés',
      });
      expect(vigente.estadoRevision).toBe('obsoleta');
      expect(vigente.obsoletaDesde).toBeInstanceOf(Date);
      expect(
        modelo.docs.filter((d) => d.estadoRevision === 'vigente'),
      ).toHaveLength(1);
    });

    it('exige el motivo del cambio', async () => {
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;
      await expect(
        versionado.publicar(String(borrador._id), '  ', 'ana'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(vigente.estadoRevision).toBe('vigente');
    });

    it('no publica lo que no es borrador', async () => {
      await expect(
        versionado.publicar(String(vigente._id), 'x', 'ana'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('prepararEdicion', () => {
    it('en un borrador el código no se cambia, pero el número de revisión sí se elige', async () => {
      // La organización puede saltear números: de la 7 pasar a la 9.
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;

      await expect(
        versionado.prepararEdicion(String(borrador._id), { code: 'OTRO' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const cambios = await versionado.prepararEdicion(String(borrador._id), {
        revision: 'Revisión: 9',
        name: 'ISOP v9',
      } as { revision: string });
      expect(cambios).toEqual({
        revision: 'Revisión: 9',
        name: 'ISOP v9',
        numeroRevision: 9,
      });
    });

    it('el número elegido tiene que ser mayor que el de las revisiones anteriores', async () => {
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;

      await expect(
        versionado.prepararEdicion(String(borrador._id), {
          revision: 'Revisión: 7',
        }),
      ).rejects.toThrow(/mayor que 7/);
    });

    it('en una vigente con hermanas (y sin uso) el texto de revisión se ignora', async () => {
      const borrador = (await versionado.crearRevision(
        String(vigente._id),
        'luis',
      )) as unknown as Doc;
      await versionado.publicar(String(borrador._id), 'cambio', 'ana');

      const cambios = await versionado.prepararEdicion(String(borrador._id), {
        revision: 'Revisión: 99',
        name: 'ISOP v8',
      } as { revision: string });
      expect(cambios).toEqual({ name: 'ISOP v8' });
    });

    it('una plantilla única y sin uso sí cambia código y revisión (recalcula el número)', async () => {
      modelo = modeloFalso([
        {
          code: 'NUEVA',
          revision: 'Rev. 1',
          numeroRevision: 1,
          estadoRevision: EstadoRevision.VIGENTE,
        },
      ]);
      versionado = new VersionadoPlantillas(modelo as never, () =>
        Promise.resolve(0),
      );

      const cambios = await versionado.prepararEdicion(
        String(modelo.docs[0]._id),
        {
          code: 'NUEVA-2',
          revision: 'Rev. 3',
        },
      );
      expect(cambios).toEqual({
        code: 'NUEVA-2',
        revision: 'Rev. 3',
        numeroRevision: 3,
      });
    });

    it('rechaza editar una vigente ya usada', async () => {
      await expect(
        versionado.prepararEdicion(String(vigente._id), { name: 'x' } as {
          code?: string;
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('exigirCodigoLibre: no se da de alta otra plantilla con el código de una vigente', async () => {
    await expect(versionado.exigirCodigoLibre('F12')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(versionado.exigirCodigoLibre('F99')).resolves.toBeUndefined();
  });

  it('historial: de la más nueva a la más vieja, con sus inspecciones', async () => {
    modelo.find = ((f: Record<string, unknown>) =>
      new Consulta((o) =>
        modelo.docs
          .filter((d) => coincide(d, f, o))
          .sort(
            (a, b) =>
              (b.numeroRevision as number) - (a.numeroRevision as number),
          ),
      )) as typeof modelo.find;

    const h = await versionado.historial('F12');
    expect(
      h.map((e) => [e.numeroRevision, e.estadoRevision, e.inspecciones]),
    ).toEqual([
      [7, 'vigente', 23],
      [6, 'obsoleta', 0],
    ]);
  });
});

describe('VersionadoPlantillas · base sin migrar', () => {
  it('traduce el duplicado del índice viejo code_1 a un mensaje que dice qué falta', async () => {
    const vigente = {
      _id: new Types.ObjectId(),
      code: 'F12',
      revision: 'Revisión: 7',
      toObject: () => ({ code: 'F12', revision: 'Revisión: 7' }),
    };
    const consulta = (r: unknown) => new Consulta(() => r);
    const modelo = {
      findById: () => consulta(vigente),
      findOne: () => consulta(null),
      find: () => consulta([vigente]),
      create: () =>
        Promise.reject(
          Object.assign(new Error('E11000 duplicate key code_1'), {
            code: 11000,
          }),
        ),
    };
    const versionado = new VersionadoPlantillas(modelo as never, () =>
      Promise.resolve(23),
    );

    await expect(
      versionado.crearRevision(String(vigente._id), 'luis'),
    ).rejects.toThrow(/Falta aplicar la migración/);
  });
});
