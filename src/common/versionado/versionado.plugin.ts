import { Schema } from 'mongoose';
import { EstadoRevision } from './versionado';

/**
 * Agrega a un esquema de plantilla los campos e índices del versionado.
 * Ver `versionado.ts` para el modelo (borrador / vigente / obsoleta).
 *
 * El esquema tiene que tener `code` y `revision`. `revision` sigue siendo el
 * texto que se imprime («Revisión: 7»); `numeroRevision` es el dato con el
 * que se ordena y se compara.
 */
export function versionadoPlantilla(schema: Schema): void {
  schema.add({
    numeroRevision: { type: Number, default: 1 },
    estadoRevision: {
      type: String,
      enum: Object.values(EstadoRevision),
      default: EstadoRevision.VIGENTE,
      index: true,
    },
    /** La revisión de la que se partió. */
    revisionAnteriorId: { type: Schema.Types.ObjectId, default: null },
    /** Obligatorio al publicar: qué cambió respecto de la anterior. */
    motivoCambio: { type: String },
    vigenteDesde: { type: Date },
    obsoletaDesde: { type: Date },
    publicadaPor: { type: String },
    creadaPor: { type: String },
  });

  // Una sola revisión con cada número dentro de una familia.
  schema.index(
    { code: 1, numeroRevision: 1 },
    { unique: true, name: 'code_1_numeroRevision_1' },
  );

  // Una sola vigente por código, garantizado por la base de datos y no solo
  // por el servicio. Clave compuesta (y no `{ code: 1 }` solo) para no chocar
  // con índices existentes sobre `code`.
  schema.index(
    { code: 1, estadoRevision: 1 },
    {
      unique: true,
      partialFilterExpression: { estadoRevision: EstadoRevision.VIGENTE },
      name: 'code_vigente_unica',
    },
  );
}
