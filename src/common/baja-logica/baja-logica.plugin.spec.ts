import { Schema } from 'mongoose';
import {
  bajaLogica,
  INCLUIR_DADOS_DE_BAJA,
  marcarDadoDeBaja,
  marcarRestaurado,
} from './baja-logica.plugin';

/**
 * El plugin se aplica a dieciséis colecciones, así que un fallo suyo no se
 * queda en un sitio. Lo que se comprueba aquí es el contrato: qué filtro
 * añade, cuándo **no** lo añade, y que los documentos anteriores al campo
 * sigan apareciendo.
 */

/** Imita el `this` de un gancho de consulta de Mongoose. */
const consultaFalsa = (
  filtroInicial: Record<string, unknown> = {},
  opciones: Record<string, unknown> = {},
) => {
  const filtro = { ...filtroInicial };
  return {
    getFilter: () => filtro,
    getOptions: () => opciones,
    where: jest.fn((cond: Record<string, unknown>) => {
      Object.assign(filtro, cond);
      return undefined;
    }),
    filtroFinal: () => filtro,
  };
};

/** Extrae el gancho registrado para una operación. */
const ganchoDe = (schema: Schema, operacion: string) => {
  const registrados: Array<(...args: unknown[]) => unknown> = [];
  const original = schema.pre.bind(schema);
  jest.spyOn(schema, 'pre').mockImplementation(((op: string, fn: never) => {
    if (op === operacion) registrados.push(fn);
    return original(op as never, fn);
  }) as never);
  return registrados;
};

describe('bajaLogica', () => {
  describe('campos', () => {
    it('añade activo, eliminadaEn y eliminadaPor', () => {
      const schema = new Schema({ nombre: String });
      schema.plugin(bajaLogica);

      expect(schema.path('activo')).toBeDefined();
      expect(schema.path('eliminadaEn')).toBeDefined();
      expect(schema.path('eliminadaPor')).toBeDefined();
    });

    it('no pisa un activo que el esquema ya declaraba', () => {
      // Nueve módulos traen el suyo con su propia documentación y su default.
      const schema = new Schema({
        nombre: String,
        activo: { type: Boolean, default: false },
      });
      schema.plugin(bajaLogica);

      const opciones = schema.path('activo') as unknown as {
        options: { default?: boolean };
      };
      expect(opciones.options.default).toBe(false);
    });
  });

  describe('filtro de consulta', () => {
    const aplicarGancho = (
      filtroInicial: Record<string, unknown> = {},
      opciones: Record<string, unknown> = {},
    ) => {
      const schema = new Schema({ nombre: String });
      const ganchos = ganchoDe(schema, 'find');
      schema.plugin(bajaLogica);

      const consulta = consultaFalsa(filtroInicial, opciones);
      ganchos.forEach((fn) => fn.call(consulta));
      return consulta;
    };

    it('excluye lo dado de baja cuando nadie se pronunció', () => {
      const consulta = aplicarGancho({ area: 'Chancado' });

      expect(consulta.filtroFinal()).toEqual({
        area: 'Chancado',
        activo: { $ne: false },
      });
    });

    it('usa $ne: false y NO activo: true', () => {
      // Los documentos anteriores al campo no lo tienen. `activo: true` los
      // dejaría fuera a todos y vaciaría la pantalla, que es exactamente lo
      // que pasó una vez con 2047 inspecciones.
      const consulta = aplicarGancho();

      expect(consulta.filtroFinal()).toEqual({ activo: { $ne: false } });
      expect(consulta.filtroFinal()).not.toEqual({ activo: true });
    });

    it('no toca el filtro si ya pide las dadas de baja', () => {
      const consulta = aplicarGancho({ activo: false });

      expect(consulta.where).not.toHaveBeenCalled();
      expect(consulta.filtroFinal()).toEqual({ activo: false });
    });

    it('no toca el filtro si piden todas con $exists', () => {
      const consulta = aplicarGancho({ activo: { $exists: true } });

      expect(consulta.where).not.toHaveBeenCalled();
    });

    it('la opción incluirDadosDeBaja devuelve todo', () => {
      // Es la vía de las pantallas de administración, que necesitan ver lo
      // inactivo para poder reactivarlo. Y la única que devuelve de verdad
      // todo: `$exists: true` dejaría fuera los documentos anteriores al
      // campo, que no lo tienen.
      const consulta = aplicarGancho({ area: 'Chancado' }, {
        [INCLUIR_DADOS_DE_BAJA]: true,
      });

      expect(consulta.where).not.toHaveBeenCalled();
      expect(consulta.filtroFinal()).toEqual({ area: 'Chancado' });
    });

    it('sin la opción, sigue excluyendo', () => {
      const consulta = aplicarGancho({}, { [INCLUIR_DADOS_DE_BAJA]: false });

      expect(consulta.filtroFinal()).toEqual({ activo: { $ne: false } });
    });

    it('cubre las ocho operaciones de consulta', () => {
      const schema = new Schema({ nombre: String });
      const espia = jest.spyOn(schema, 'pre');
      schema.plugin(bajaLogica);

      const operaciones = espia.mock.calls.map((llamada) => llamada[0]);
      for (const esperada of [
        'find',
        'findOne',
        'findOneAndUpdate',
        'findOneAndDelete',
        'countDocuments',
        'updateOne',
        'updateMany',
        'distinct',
        'aggregate',
      ]) {
        expect(operaciones).toContain(esperada);
      }
    });
  });

  describe('agregación', () => {
    const aplicarGanchoAgregacion = (tuberia: Record<string, unknown>[]) => {
      const schema = new Schema({ nombre: String });
      const ganchos = ganchoDe(schema, 'aggregate');
      schema.plugin(bajaLogica);

      ganchos.forEach((fn) => fn.call({ pipeline: () => tuberia }));
      return tuberia;
    };

    it('antepone el $match a la tubería', () => {
      // Sin esto las estadísticas seguirían contando lo dado de baja, que es
      // el número que a nadie se le ocurre revisar.
      const tuberia = aplicarGanchoAgregacion([
        { $group: { _id: '$area' } },
      ]);

      expect(tuberia[0]).toEqual({ $match: { activo: { $ne: false } } });
      expect(tuberia).toHaveLength(2);
    });

    it('no lo antepone si la primera etapa ya habla de activo', () => {
      const tuberia = aplicarGanchoAgregacion([
        { $match: { activo: false } },
      ]);

      expect(tuberia).toHaveLength(1);
    });

    it('funciona con la tubería vacía', () => {
      const tuberia = aplicarGanchoAgregacion([]);

      expect(tuberia[0]).toEqual({ $match: { activo: { $ne: false } } });
    });
  });

  describe('marcarDadoDeBaja / marcarRestaurado', () => {
    it('deja constancia de quién y cuándo', () => {
      const antes = Date.now();
      const campos = marcarDadoDeBaja('jperez');

      expect(campos.activo).toBe(false);
      expect(campos.eliminadaPor).toBe('jperez');
      expect(campos.eliminadaEn.getTime()).toBeGreaterThanOrEqual(antes);
    });

    it('al restaurar limpia quién y cuándo', () => {
      // Si no se limpian y el documento vuelve a darse de baja, los valores
      // viejos harían creer que fue en aquella fecha y a manos de aquella
      // persona.
      expect(marcarRestaurado()).toEqual({
        activo: true,
        eliminadaEn: undefined,
        eliminadaPor: undefined,
      });
    });
  });
});
