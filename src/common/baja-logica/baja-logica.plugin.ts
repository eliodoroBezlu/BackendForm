import { Schema } from 'mongoose';

/**
 * Baja lógica para cualquier colección: nada se borra, pasa a inactivo.
 * ──────────────────────────────────────────────────────────────────────
 *
 * ## Por qué existe
 *
 * El criterio de la casa es que la información no se elimina. La realidad del
 * código era otra: **catorce endpoints borraban de verdad**, y nueve de esos
 * módulos ya tenían el campo `activo` en su esquema y lo ignoraban al borrar.
 * La intención estaba; el cableado no.
 *
 * Además convivían tres formas de hacerlo: ganchos automáticos en las
 * inspecciones de herramientas, filtros escritos a mano en cada consulta de
 * planes de acción, y nada en el resto. Este plugin es la de las inspecciones
 * —la que funciona— convertida en algo que se aplica con una línea.
 *
 * ## Qué hace
 *
 * Añade `activo`, `eliminadaEn` y `eliminadaPor`, y **excluye lo dado de baja
 * de toda consulta** sin que cada llamada tenga que acordarse de filtrarlo.
 *
 * Se hace en el esquema y no en el servicio a propósito: un servicio tiene
 * quince puntos de consulta y crecerá, y filtrar en cada uno convierte cada
 * método nuevo en una ocasión de olvidarlo. El olvido además no se nota —la
 * pantalla sigue mostrando algo que se dio de baja—. Puesto aquí, la exclusión
 * es la norma y saltársela hay que pedirlo.
 *
 * ## Uso
 *
 * ```ts
 * const MiSchema = SchemaFactory.createForClass(MiClase);
 * MiSchema.plugin(bajaLogica);
 * ```
 *
 * Y en el servicio, en vez de `findByIdAndDelete`:
 *
 * ```ts
 * await this.modelo.findByIdAndUpdate(id, {
 *   activo: false, eliminadaEn: new Date(), eliminadaPor: usuario,
 * });
 * ```
 *
 * ## Cómo consultar lo dado de baja
 *
 * **Para verlo todo, la opción:**
 *
 * ```ts
 * this.modelo.find().setOptions({ incluirDadosDeBaja: true });
 * ```
 *
 * Es la vía buena para las pantallas de administración, que necesitan listar
 * lo inactivo para poder reactivarlo. Y es la única que devuelve **de verdad**
 * todo: `{ activo: { $exists: true } }` parece equivalente pero deja fuera los
 * documentos anteriores a la llegada del campo, que no lo tienen.
 *
 * **Para pedir un subconjunto concreto, nombrando `activo` en el filtro.** El
 * gancho no actúa si quien consulta ya se pronunció:
 *
 * - `find({ activo: false })` → solo las dadas de baja.
 * - `aggregate([{ $match: { activo: … } }, …])` → ídem, si va en la primera
 *   etapa.
 *
 * ## La trampa del filtro
 *
 * Todo filtro se escribe **`{ activo: { $ne: false } }` y nunca
 * `{ activo: true }`**. El valor por defecto es `true`, pero **los documentos
 * anteriores a la llegada del campo no lo tienen**, y `{ activo: true }` los
 * dejaría fuera a todos. Eso ya vació una pantalla una vez, con 2047
 * documentos históricos. El plugin lo fija para que no vuelva a decidirse en
 * cada consulta.
 */

/** Operaciones de consulta que reciben el filtro. */
const GANCHOS_DE_CONSULTA = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'updateOne',
  'updateMany',
  'distinct',
] as const;

/**
 * Opción de consulta que desactiva la exclusión y devuelve también lo dado de
 * baja. Para las pantallas de administración, que necesitan verlo para poder
 * reactivarlo.
 */
export const INCLUIR_DADOS_DE_BAJA = 'incluirDadosDeBaja';

/**
 * Antepone la condición al filtro, salvo que quien consulta lo haya pedido
 * explícitamente —por la opción o nombrando `activo`—.
 */
const excluirDadasDeBaja = function (this: {
  getFilter: () => Record<string, unknown>;
  getOptions?: () => Record<string, unknown>;
  where: (cond: Record<string, unknown>) => unknown;
}) {
  if (this.getOptions?.()?.[INCLUIR_DADOS_DE_BAJA]) return;

  if (!('activo' in this.getFilter())) {
    this.where({ activo: { $ne: false } });
  }
};

/**
 * Aplica la baja lógica a un esquema.
 *
 * Los campos solo se añaden si no estaban ya declarados: nueve de los módulos
 * traen su propio `activo` con su documentación, y pisarlo perdería lo que
 * cada uno explica sobre él.
 */
export function bajaLogica(schema: Schema): void {
  if (!schema.path('activo')) {
    schema.add({ activo: { type: Boolean, default: true, index: true } });
  }
  if (!schema.path('eliminadaEn')) {
    schema.add({ eliminadaEn: { type: Date, required: false } });
  }
  if (!schema.path('eliminadaPor')) {
    schema.add({ eliminadaPor: { type: String, required: false } });
  }

  // `findById` y `findByIdAndUpdate` pasan por `findOne`/`findOneAndUpdate`,
  // así que quedan cubiertos sin nombrarlos.
  for (const gancho of GANCHOS_DE_CONSULTA) {
    schema.pre(gancho, excluirDadasDeBaja);
  }

  /**
   * Las agregaciones no llevan filtro, llevan tubería: se les antepone la
   * etapa. Sin esto las estadísticas seguirían contando lo dado de baja, que
   * es precisamente el número que a nadie se le ocurre revisar.
   */
  schema.pre('aggregate', function () {
    const tuberia = this.pipeline();
    const yaFiltra =
      tuberia.length > 0 &&
      '$match' in tuberia[0] &&
      'activo' in
        ((tuberia[0] as { $match: Record<string, unknown> }).$match ?? {});

    if (!yaFiltra) {
      tuberia.unshift({ $match: { activo: { $ne: false } } });
    }
  });
}

/**
 * Los campos que hay que escribir para dar de baja un documento.
 *
 * Existe para que los servicios no vayan escribiendo el objeto a mano y algún
 * día uno se deje `eliminadaPor`, que es el dato que responde a «quién hizo
 * esto».
 */
export const marcarDadoDeBaja = (usuario: string) => ({
  activo: false,
  eliminadaEn: new Date(),
  eliminadaPor: usuario,
});

/**
 * Los campos que devuelven un documento al uso.
 *
 * `eliminadaEn` y `eliminadaPor` se vacían: si volviera a darse de baja, los
 * valores viejos harían creer que fue en aquella fecha y a manos de aquella
 * persona.
 */
export const marcarRestaurado = () => ({
  activo: true,
  eliminadaEn: undefined,
  eliminadaPor: undefined,
});
