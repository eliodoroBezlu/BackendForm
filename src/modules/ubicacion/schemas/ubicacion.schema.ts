import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

/**
 * Ubicación física de un equipo, organizada en árbol de hasta 7 niveles:
 * «Taller de flotación › Bodega 1 › Estante A».
 *
 * `padre` es la fuente de verdad. `ancestros`, `ruta`, `nivel` y
 * `nombreNormalizado` son derivados que **solo escribe `UbicacionService`**,
 * con las funciones de `arbol/ubicacion-arbol.ts` — ver ahí por qué existen.
 */
@Schema({ timestamps: true })
export class Ubicacion extends Document {
  /** Tal como lo escribió el usuario. Único entre hermanos, no global. */
  @Prop({ type: String, required: true })
  nombre: string;

  /** Clave de unicidad entre hermanos: mayúsculas, sin tildes ni espacios dobles. */
  @Prop({ type: String, required: true })
  nombreNormalizado: string;

  /** `null` = raíz. */
  @Prop({ type: Types.ObjectId, ref: 'Ubicacion', default: null })
  padre: Types.ObjectId | null;

  /** De la raíz al padre. `find({ ancestros: X })` = todo lo que cuelga de X. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Ubicacion' }], default: [] })
  ancestros: Types.ObjectId[];

  /** «Taller de flotación › Bodega 1 › Estante A». */
  @Prop({ type: String, required: true })
  ruta: string;

  /** 0 = raíz; máximo 6. */
  @Prop({ type: Number, default: 0 })
  nivel: number;

  @Prop({ type: Boolean, default: true })
  activo: boolean;
}

export type UbicacionDocument = Ubicacion & Document;
export const UbicacionSchema = SchemaFactory.createForClass(Ubicacion);

/**
 * El nombre es único **entre hermanos**: puede haber un «Estante A» en cada
 * bodega, pero no dos en la misma.
 *
 * Reemplaza al índice único global `nombre_1`, que Mongoose no borra solo al
 * cambiar el esquema: lo borra `scripts/migrar-ubicaciones-jerarquia.cjs`.
 *
 * Incluye los dados de baja —el índice no distingue—; por eso el servicio
 * busca el hermano inactivo antes de crear y ofrece restaurarlo en vez de
 * devolver el error crudo de duplicado.
 */
UbicacionSchema.index({ padre: 1, nombreNormalizado: 1 }, { unique: true });
UbicacionSchema.index({ ancestros: 1 });

/**
 * No se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Los equipos apuntan a su ubicacion; borrarla los dejaria sin sitio.
 */
UbicacionSchema.plugin(bajaLogica);
