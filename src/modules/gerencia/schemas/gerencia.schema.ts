// gerencia.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Nivel más alto de la jerarquía operativa: **Gerencia → Superintendencia →
 * Área → subárea**.
 *
 * Existía como texto suelto en el PGR y en las matrices, y como columna del
 * inventario (`GERENCIA DE MANTENIMIENTO PLANTA`), pero sin entidad propia no
 * se podía colgar nada de ella. Se modela igual que `Superintendencia` y
 * `Area` para que la cadena de referencias sea una sola.
 */
@Schema({ timestamps: true })
export class Gerencia extends Document {
  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ default: true })
  activo: boolean;

  @Prop()
  creadoPor: string;

  @Prop()
  actualizadoPor: string;
}

export const GerenciaSchema = SchemaFactory.createForClass(Gerencia);
