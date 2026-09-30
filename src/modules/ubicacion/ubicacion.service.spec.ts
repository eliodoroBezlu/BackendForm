import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { UbicacionService } from './ubicacion.service';
import { INCLUIR_DADOS_DE_BAJA } from '../../common/baja-logica/baja-logica.plugin';

/**
 * El servicio se prueba contra un modelo falso en memoria, no contra mocks
 * encadenados: lo que importa aquí es el estado del árbol después de cada
 * operación (rutas, niveles, quién cuelga de quién), y eso solo se ve si las
 * escrituras se aplican de verdad.
 *
 * El falso imita lo justo de Mongoose y del plugin de baja lógica: excluye lo
 * inactivo salvo que se pida con la opción o se nombre `activo` en el filtro.
 */

type Doc = Record<string, unknown> & { _id: Types.ObjectId };
type Filtro = Record<string, unknown>;
type Opciones = Record<string, unknown>;

class ConsultaFalsa<T> {
  private readonly opciones: Opciones = {};
  constructor(private readonly ejecutar: (opciones: Opciones) => T) {}
  setOptions(o: Opciones) {
    Object.assign(this.opciones, o);
    return this;
  }
  collation() {
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
    return Promise.resolve(this.ejecutar(this.opciones));
  }
}

const igual = (a: unknown, b: unknown) => String(a) === String(b);

function coincide(doc: Doc, filtro: Filtro, opciones: Opciones): boolean {
  if (
    !opciones[INCLUIR_DADOS_DE_BAJA] &&
    !('activo' in filtro) &&
    doc.activo === false
  ) {
    return false;
  }
  return Object.entries(filtro).every(([campo, esperado]) => {
    const actual = doc[campo];
    if (esperado && typeof esperado === 'object' && '$ne' in esperado) {
      return !igual(actual, (esperado as { $ne: unknown }).$ne);
    }
    if (esperado === null) return actual === null || actual === undefined;
    if (Array.isArray(actual)) return actual.some((a) => igual(a, esperado));
    return igual(actual, esperado);
  });
}

function modeloFalso(inicial: Array<Partial<Doc>>) {
  const docs: Doc[] = inicial.map((d) => ({
    _id: new Types.ObjectId(),
    activo: true,
    ...d,
  })) as Doc[];

  const actualizar = (filtro: Filtro, cambios: Filtro) =>
    new ConsultaFalsa((o) => {
      const doc = docs.find((d) => coincide(d, filtro, o));
      if (doc) Object.assign(doc, cambios);
      return doc ?? null;
    });

  return {
    docs,
    findById: (id: unknown) =>
      new ConsultaFalsa(
        (o) => docs.find((d) => coincide(d, { _id: id }, o)) ?? null,
      ),
    findOne: (f: Filtro) =>
      new ConsultaFalsa((o) => docs.find((d) => coincide(d, f, o)) ?? null),
    find: (f: Filtro = {}) =>
      new ConsultaFalsa((o) => docs.filter((d) => coincide(d, f, o))),
    countDocuments: (f: Filtro) =>
      new ConsultaFalsa((o) => docs.filter((d) => coincide(d, f, o)).length),
    create: (d: Filtro) => {
      const nuevo = { _id: new Types.ObjectId(), activo: true, ...d } as Doc;
      docs.push(nuevo);
      return Promise.resolve(nuevo);
    },
    findByIdAndUpdate: (id: unknown, cambios: Filtro) =>
      actualizar({ _id: id }, cambios),
    findOneAndUpdate: (f: Filtro, cambios: Filtro) => actualizar(f, cambios),
    updateMany: (f: Filtro, cambios: Filtro) =>
      new ConsultaFalsa((o) => {
        const afectados = docs.filter((d) => coincide(d, f, o));
        afectados.forEach((d) => Object.assign(d, cambios));
        return { modifiedCount: afectados.length };
      }),
    bulkWrite: (
      ops: Array<{
        updateOne: { filter: { _id: unknown }; update: { $set: Filtro } };
      }>,
    ) => {
      for (const { updateOne } of ops) {
        const doc = docs.find((d) => igual(d._id, updateOne.filter._id));
        if (doc) Object.assign(doc, updateOne.update.$set);
      }
      return Promise.resolve();
    },
  };
}

/** Un nodo ya migrado, con sus derivados coherentes. */
const nodo = (
  nombre: string,
  padre: Doc | null,
  extra: Partial<Doc> = {},
): Partial<Doc> => ({
  _id: new Types.ObjectId(),
  nombre,
  nombreNormalizado: nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  padre: padre ? padre._id : null,
  ancestros: padre ? [...(padre.ancestros as Types.ObjectId[]), padre._id] : [],
  ruta: padre ? `${padre.ruta as string} › ${nombre}` : nombre,
  nivel: padre ? (padre.nivel as number) + 1 : 0,
  ...extra,
});

describe('UbicacionService', () => {
  let servicio: UbicacionService;
  let ubicaciones: ReturnType<typeof modeloFalso>;
  let equipos: ReturnType<typeof modeloFalso>;
  let taller: Doc;
  let bodega: Doc;
  let estante: Doc;

  const porNombre = (nombre: string) =>
    ubicaciones.docs.find((d) => d.nombre === nombre) as Doc;

  beforeEach(() => {
    // Taller › Bodega › Estante, más «Viejo» dado de baja y un equipo en Bodega.
    const t = nodo('Taller', null) as Doc;
    const b = nodo('Bodega', t) as Doc;
    const e = nodo('Estante', b) as Doc;
    const viejo = nodo('Viejo', null, { activo: false });
    ubicaciones = modeloFalso([t, b, e, viejo]);
    [taller, bodega, estante] = ubicaciones.docs;
    equipos = modeloFalso([{ ubicacion_id: bodega._id }]);

    servicio = new UbicacionService(ubicaciones as never, equipos as never);
  });

  describe('create', () => {
    it('cuelga la nueva ubicación del padre con ruta, nivel y ancestros', async () => {
      const creada = await servicio.create({
        nombre: '  Estante   B ',
        padre: String(bodega._id),
      });

      expect(creada).toMatchObject({
        nombre: 'Estante B',
        ruta: 'Taller › Bodega › Estante B',
        nivel: 2,
      });
      expect((creada.ancestros as unknown[]).map(String)).toEqual([
        String(taller._id),
        String(bodega._id),
      ]);
    });

    it('rechaza un hermano con el mismo nombre aunque cambien mayúsculas', async () => {
      await expect(
        servicio.create({ nombre: 'estante', padre: String(bodega._id) }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite el mismo nombre bajo otro padre', async () => {
      await expect(
        servicio.create({ nombre: 'Estante', padre: String(taller._id) }),
      ).resolves.toMatchObject({ ruta: 'Taller › Estante' });
    });

    it('si el nombre existe dado de baja, lo dice en vez del error crudo de duplicado', async () => {
      await expect(servicio.create({ nombre: 'VIEJO' })).rejects.toThrow(
        /dada de baja. Se puede restaurar/,
      );
    });

    it('no admite hijos por debajo del nivel 7', async () => {
      const hoja = await servicio.findOrCreateByRuta('A>B>C>D>E>F>G');
      expect(hoja.nivel).toBe(6);

      await expect(
        servicio.create({ nombre: 'H', padre: String(hoja._id) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no cuelga nada de un padre dado de baja', async () => {
      await expect(
        servicio.create({ nombre: 'X', padre: String(porNombre('Viejo')._id) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOrCreateByRuta (importador)', () => {
    it('reutiliza los tramos existentes sin importar mayúsculas ni tildes, y crea el que falta', async () => {
      const antes = ubicaciones.docs.length;
      const hoja = await servicio.findOrCreateByRuta(
        'taller > BODEGA > Estante Nuevo',
      );

      expect(ubicaciones.docs.length).toBe(antes + 1);
      expect(hoja).toMatchObject({
        ruta: 'Taller › Bodega › Estante Nuevo',
        nivel: 2,
      });
      expect(igual(hoja.padre, bodega._id)).toBe(true);
    });

    it('un nombre suelto se busca solo entre raíces', async () => {
      const raiz = await servicio.findOrCreateByRuta('Estante');

      expect(igual(raiz._id, estante._id)).toBe(false);
      expect(raiz).toMatchObject({ nivel: 0, ruta: 'Estante', padre: null });
    });

    it('rechaza más de 7 niveles sin crear nada', async () => {
      const antes = ubicaciones.docs.length;

      await expect(
        servicio.findOrCreateByRuta('A>B>C>D>E>F>G>H'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ubicaciones.docs.length).toBe(antes);
    });

    it('rechaza una ruta que pasa por una ubicación dada de baja', async () => {
      await expect(
        servicio.findOrCreateByRuta('Viejo > Algo'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una celda que solo tiene separadores', async () => {
      await expect(servicio.findOrCreateByRuta(' > ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('no deja mover una ubicación dentro de su propio descendiente', async () => {
      await expect(
        servicio.update(String(bodega._id), { padre: String(estante._id) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('renombrar recalcula la ruta de todo lo que cuelga, también lo dado de baja', async () => {
      estante.activo = false;

      await servicio.update(String(taller._id), { nombre: 'Taller Central' });

      expect(estante.ruta).toBe('Taller Central › Bodega › Estante');
    });

    it('mover a raíz (padre: null) recalcula nivel y ancestros del subárbol', async () => {
      await servicio.update(String(bodega._id), { padre: null });

      expect(bodega).toMatchObject({ nivel: 0, ruta: 'Bodega', padre: null });
      expect(estante).toMatchObject({ nivel: 1, ruta: 'Bodega › Estante' });
      expect((estante.ancestros as unknown[]).map(String)).toEqual([
        String(bodega._id),
      ]);
    });

    it('rechaza mover un subárbol que no cabe en la profundidad máxima', async () => {
      const hoja = await servicio.findOrCreateByRuta('A>B>C>D>E>F');
      // F está en el nivel 6 de 7. Bodega cabría (7), pero arrastra a
      // Estante, que quedaría en el 8.

      await expect(
        servicio.update(String(bodega._id), { padre: String(hoja._id) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza renombrar a un nombre que ya tiene un hermano', async () => {
      await servicio.create({ nombre: 'Pañol', padre: String(taller._id) });

      await expect(
        servicio.update(String(bodega._id), { nombre: 'PAÑOL' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('bloquea la baja si tiene ubicaciones debajo', async () => {
      await expect(
        servicio.remove(String(taller._id), 'admin'),
      ).rejects.toThrow(/1 ubicación\(es\) debajo/);
    });

    it('bloquea la baja si tiene equipos', async () => {
      await expect(
        servicio.remove(String(bodega._id), 'admin'),
      ).rejects.toThrow(/1 equipo\(s\)/);
    });

    it('da de baja una hoja sin equipos', async () => {
      await servicio.remove(String(estante._id), 'admin');

      expect(estante).toMatchObject({ activo: false, eliminadaPor: 'admin' });
    });
  });

  describe('restaurar', () => {
    it('no restaura una ubicación cuyo padre sigue dado de baja', async () => {
      estante.activo = false;
      bodega.activo = false;

      await expect(
        servicio.restaurar(String(estante._id)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si no estaba dada de baja', async () => {
      await expect(
        servicio.restaurar(String(taller._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('fusionar', () => {
    it('pasa equipos (también los dados de baja) e hijas al destino y da de baja el origen', async () => {
      const duplicado = await servicio.create({ nombre: 'Taller 2' });
      const hija = await servicio.create({
        nombre: 'Rincón',
        padre: String(duplicado._id),
      });
      equipos.docs.push(
        {
          _id: new Types.ObjectId(),
          activo: true,
          ubicacion_id: duplicado._id,
        },
        {
          _id: new Types.ObjectId(),
          activo: false,
          ubicacion_id: duplicado._id,
        },
      );

      const resultado = await servicio.fusionar(
        String(duplicado._id),
        String(taller._id),
        'admin',
      );

      expect(resultado).toMatchObject({
        equiposMovidos: 2,
        ubicacionesMovidas: 1,
      });
      expect(hija).toMatchObject({ ruta: 'Taller › Rincón', nivel: 1 });
      expect(duplicado.activo).toBe(false);
    });

    it('no fusiona en un destino que cuelga del origen', async () => {
      await expect(
        servicio.fusionar(String(taller._id), String(estante._id), 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no fusiona si una hija choca de nombre con una del destino, y no mueve nada', async () => {
      const otro = await servicio.create({ nombre: 'Otro Taller' });
      await servicio.create({ nombre: 'bodega', padre: String(otro._id) });

      await expect(
        servicio.fusionar(String(otro._id), String(taller._id), 'admin'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(otro.activo).toBe(true);
    });
  });
});
