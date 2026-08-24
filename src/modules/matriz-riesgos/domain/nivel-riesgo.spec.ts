import {
  CATEGORIAS,
  CONDICIONES,
  normalizarCategoria,
  normalizarCondicion,
} from './nivel-riesgo';

describe('normalizarCategoria', () => {
  it('acepta la forma del catálogo', () => {
    for (const categoria of CATEGORIAS) {
      expect(normalizarCategoria(categoria)).toBe(categoria);
    }
  });

  /**
   * El caso real: la columna E se llena a mano y cuatro de las matrices de
   * Mantenimiento Planta traen `SEGURIDAD` y `Seguridad` **en el mismo
   * archivo**. Sin canonizar, la misma tarea se partía en dos actividades y el
   * guardado fallaba contra el `enum` del esquema.
   */
  it('canoniza mayúsculas, minúsculas y espacios sobrantes', () => {
    expect(normalizarCategoria('SEGURIDAD')).toBe('Seguridad');
    expect(normalizarCategoria('seguridad')).toBe('Seguridad');
    expect(normalizarCategoria('  Seguridad  ')).toBe('Seguridad');
    expect(normalizarCategoria('MEDIO AMBIENTE')).toBe('Medio Ambiente');
  });

  it('canoniza también sin tildes', () => {
    expect(normalizarCategoria('DSRC/ESTRATEGICO')).toBe('DSRC/Estratégico');
  });

  it('devuelve null para lo que no está en el catálogo', () => {
    expect(normalizarCategoria('Ciberseguridad')).toBeNull();
    expect(normalizarCategoria('')).toBeNull();
    expect(normalizarCategoria(undefined)).toBeNull();
    expect(normalizarCategoria({ richText: [] })).toBeNull();
  });
});

describe('normalizarCondicion', () => {
  it('acepta la forma del catálogo', () => {
    for (const condicion of CONDICIONES) {
      expect(normalizarCondicion(condicion)).toBe(condicion);
    }
  });

  it('canoniza mayúsculas y tildes', () => {
    expect(normalizarCondicion('NORMAL')).toBe('Normal');
    expect(normalizarCondicion('economico')).toBe('Económico');
  });

  it('devuelve null para lo desconocido', () => {
    expect(normalizarCondicion('Excepcional')).toBeNull();
    expect(normalizarCondicion(null)).toBeNull();
  });
});
