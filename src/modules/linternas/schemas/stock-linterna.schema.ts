import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Existencia de linternas. **Un solo documento** en la colección.
 *
 * No hay identificación unitaria —las linternas no llevan código ni serie—, así
 * que lo que se controla es la cantidad: se entrega contra ella y se repone con
 * un ingreso explícito.
 *
 * Las devueltas **no vuelven al stock**: están averiadas. Solo un `ingreso`
 * sube la cuenta.
 */
@Schema({ timestamps: true, collection: 'stock_linternas' })
export class StockLinterna extends Document {
  /**
   * Clave fija para que solo pueda existir un documento. Sin esto, dos altas
   * simultáneas crearían dos stocks y las entregas descontarían de cualquiera.
   */
  @Prop({ required: true, unique: true, default: 'linterna' })
  clave: string;

  @Prop({ required: true, default: 0, min: 0 })
  cantidadDisponible: number;
}

export const StockLinternaSchema = SchemaFactory.createForClass(StockLinterna);

/** Cada reposición de existencias, para poder cuadrar el consumo. */
@Schema({ timestamps: true, collection: 'ingresos_linterna' })
export class IngresoLinterna extends Document {
  @Prop({ required: true, min: 1 })
  cantidad: number;

  @Prop({ required: true })
  fecha: Date;

  @Prop({ required: true })
  registradoPor: string;

  @Prop()
  observacion?: string;
}

export const IngresoLinternaSchema =
  SchemaFactory.createForClass(IngresoLinterna);
