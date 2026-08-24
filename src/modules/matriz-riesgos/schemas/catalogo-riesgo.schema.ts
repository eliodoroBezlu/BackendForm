import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CATEGORIAS } from '../domain/nivel-riesgo';

/**
 * Tipos de catálogo. Cada categoría de riesgo tiene su propio juego, y la
 * columna que los consume en la matriz aparece entre paréntesis.
 */
export enum TipoCatalogo {
  /** Familia de Peligro / Aspecto / Evento (col F). */
  PELIGRO = 'PELIGRO',
  /** Familia de Riesgo / Impacto / Consecuencia (col H). */
  RIESGO = 'RIESGO',
  /** Familia de Controles / Acciones (col P). */
  CONTROL = 'CONTROL',
  /** Familia de Verificadores (col R). */
  FAMILIA_VERIFICADOR = 'FAMILIA_VERIFICADOR',
  /** Verificador concreto (col S) — el puente hacia las actividades del PGR. */
  VERIFICADOR = 'VERIFICADOR',
}

export type CatalogoRiesgoDocument = CatalogoRiesgo & Document;

/**
 * Catálogo en cascada de la matriz IPER.
 *
 * En el Excel esto son 54 rangos con nombre (`FP_SE`, `FR_MA`, `FC_SA`…) sobre
 * la hoja `PARÁMETROS`: 603 entradas repartidas en 9 categorías. Aquí se
 * normalizan a una sola colección con `(categoria, tipo)` como discriminador,
 * que es lo que permite resolver la cascada con una consulta en vez de con
 * ocho ramas de `IF` anidadas.
 *
 * Se siembra desde el propio formulario con
 * `scripts/seed-catalogos-matriz.cjs`, para que la fuente de verdad siga
 * siendo el documento oficial y no una transcripción a mano.
 *
 * ⚠️ Nunca borrar una entrada usada por alguna matriz: se da de baja con
 * `activo = false`. Borrarla dejaría matrices históricas apuntando a un valor
 * inexistente y rompería su reimportación.
 */
@Schema({ timestamps: true })
export class CatalogoRiesgo {
  @Prop({ required: true, enum: CATEGORIAS, index: true })
  categoria: string;

  @Prop({ required: true, enum: TipoCatalogo, index: true })
  tipo: TipoCatalogo;

  @Prop({ required: true, trim: true })
  valor: string;

  /**
   * Orden de presentación. Importa de verdad en la jerarquía de control, donde
   * el número (6…1) es semántico y no alfabético.
   */
  @Prop({ default: 0 })
  orden: number;

  @Prop({ default: true, index: true })
  activo: boolean;

  /** Marca las entradas creadas por el seed, para distinguirlas de las manuales. */
  @Prop({ default: false })
  desdeFormulario: boolean;

  @Prop()
  creadoPor?: string;

  @Prop()
  actualizadoPor?: string;
}

export const CatalogoRiesgoSchema =
  SchemaFactory.createForClass(CatalogoRiesgo);

// Un mismo valor no puede repetirse dentro de su categoría y tipo. Es también
// la clave que usa el seed para ser idempotente.
CatalogoRiesgoSchema.index(
  { categoria: 1, tipo: 1, valor: 1 },
  { unique: true },
);

// Consulta típica de la UI: "dame los peligros de Seguridad que estén activos".
CatalogoRiesgoSchema.index({ categoria: 1, tipo: 1, activo: 1 });
