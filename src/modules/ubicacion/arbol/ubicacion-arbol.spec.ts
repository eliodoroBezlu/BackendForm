import {
  alturaSubarbol,
  derivadosDe,
  formariaCiclo,
  limpiarNombre,
  partirRuta,
  recalcularDescendientes,
} from './ubicacion-arbol';

/**
 * Taller (0) › Bodega (1) › Estante (2) › Caja (3)
 *           › Pañol  (1)
 */
const TALLER = { _id: 't', ancestros: [], ruta: 'Taller', nivel: 0 };
const PLANOS = [
  { _id: 'b', nombre: 'Bodega', padre: 't' },
  { _id: 'e', nombre: 'Estante', padre: 'b' },
  { _id: 'c', nombre: 'Caja', padre: 'e' },
  { _id: 'p', nombre: 'Pañol', padre: 't' },
];

describe('ubicacion-arbol', () => {
  describe('derivadosDe', () => {
    it('una raíz: sin ancestros, nivel 0, ruta = nombre', () => {
      expect(derivadosDe('Taller de flotación', null)).toEqual({
        padre: null,
        ancestros: [],
        ruta: 'Taller de flotación',
        nivel: 0,
        nombreNormalizado: 'TALLER DE FLOTACION',
      });
    });

    it('un hijo hereda los ancestros del padre más el padre', () => {
      const bodega = {
        _id: 'b',
        ancestros: ['t'],
        ruta: 'Taller › Bodega',
        nivel: 1,
      };
      expect(derivadosDe('Estante A', bodega)).toMatchObject({
        padre: 'b',
        ancestros: ['t', 'b'],
        ruta: 'Taller › Bodega › Estante A',
        nivel: 2,
      });
    });

    it('la clave de unicidad ignora mayúsculas, tildes y espacios dobles', () => {
      expect(derivadosDe('taller  de Flotación', null).nombreNormalizado).toBe(
        derivadosDe('TALLER DE FLOTACION', null).nombreNormalizado,
      );
    });
  });

  describe('partirRuta', () => {
    it('parte por > y recorta cada tramo', () => {
      expect(partirRuta(' Taller de flotación >Bodega 1>  Estante A ')).toEqual(
        ['Taller de flotación', 'Bodega 1', 'Estante A'],
      );
    });

    it('un nombre sin > es un solo tramo (compatibilidad con el Excel viejo)', () => {
      expect(partirRuta('TALLER DE SOLDADURA')).toEqual([
        'TALLER DE SOLDADURA',
      ]);
    });

    it('/ no separa: puede ser parte de un nombre', () => {
      expect(partirRuta('Taller E/I > Banco 2')).toEqual([
        'Taller E/I',
        'Banco 2',
      ]);
    });

    it('descarta tramos vacíos', () => {
      expect(partirRuta('> Taller > > Estante >')).toEqual([
        'Taller',
        'Estante',
      ]);
      expect(partirRuta(' > ')).toEqual([]);
    });
  });

  it('limpiarNombre colapsa espacios pero conserva mayúsculas y tildes', () => {
    expect(limpiarNombre('  Taller   de Flotación ')).toBe(
      'Taller de Flotación',
    );
  });

  describe('formariaCiclo', () => {
    it('colgar un nodo de sí mismo', () => {
      expect(
        formariaCiclo('b', { _id: 'b', ancestros: ['t'], ruta: '', nivel: 1 }),
      ).toBe(true);
    });

    it('colgar un nodo de un descendiente suyo', () => {
      const caja = { _id: 'c', ancestros: ['t', 'b', 'e'], ruta: '', nivel: 3 };
      expect(formariaCiclo('b', caja)).toBe(true);
    });

    it('colgarlo de un hermano no es ciclo', () => {
      const panol = { _id: 'p', ancestros: ['t'], ruta: '', nivel: 1 };
      expect(formariaCiclo('b', panol)).toBe(false);
    });
  });

  describe('alturaSubarbol', () => {
    it('cuenta los niveles que hay debajo', () => {
      expect(alturaSubarbol('t', PLANOS)).toBe(3);
      expect(alturaSubarbol('b', PLANOS)).toBe(2);
      expect(alturaSubarbol('c', PLANOS)).toBe(0);
    });
  });

  describe('recalcularDescendientes', () => {
    it('al renombrar la raíz, reescribe la ruta de nietos y bisnietos', () => {
      const renombrado = { ...TALLER, ruta: 'Taller Central' };
      const cambios = recalcularDescendientes(renombrado, PLANOS);

      expect(cambios).toHaveLength(4);
      expect(cambios.find((c) => c._id === 'c')).toEqual({
        _id: 'c',
        padre: 'e',
        ancestros: ['t', 'b', 'e'],
        ruta: 'Taller Central › Bodega › Estante › Caja',
        nivel: 3,
      });
    });

    it('al mover un subárbol, ajusta ancestros y nivel de todo lo que cuelga', () => {
      // Bodega pasa a colgar de Pañol: Taller › Pañol › Bodega.
      const bodegaMovida = {
        _id: 'b',
        ancestros: ['t', 'p'],
        ruta: 'Taller › Pañol › Bodega',
        nivel: 2,
      };
      const cambios = recalcularDescendientes(
        bodegaMovida,
        PLANOS.filter((n) => ['e', 'c'].includes(n._id)),
      );

      expect(cambios.find((c) => c._id === 'c')).toMatchObject({
        ancestros: ['t', 'p', 'b', 'e'],
        nivel: 4,
        ruta: 'Taller › Pañol › Bodega › Estante › Caja',
      });
    });
  });
});
