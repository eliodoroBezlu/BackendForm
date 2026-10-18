import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { TipoCatalogoMonitoreo } from '../domain/catalogos-iniciales';

/**
 * Un valor de una lista del reporte de monitoreo: una técnica, un proveedor,
 * una severidad…
 *
 * Todas las listas viven en una sola colección, distinguidas por `tipo`: son
 * diez listas cortas con la misma forma, y una colección por lista sería diez
 * módulos para lo mismo.
 */
@Schema({ timestamps: true, collection: 'catalogos_monitoreo' })
export class CatalogoMonitoreo extends Document {
  @Prop({
    type: String,
    enum: TipoCatalogoMonitoreo,
    required: true,
    index: true,
  })
  tipo: TipoCatalogoMonitoreo;

  /** Como se muestra: «Weir Vulco». */
  @Prop({ type: String, required: true, trim: true })
  valor: string;

  /**
   * «WEIR VULCO»: la clave que impide cargar el mismo valor escrito de otra
   * forma, que es justo el desorden que tienen hoy los antecedentes.
   */
  @Prop({ type: String, required: true })
  valor_normalizado: string;

  /** Código corto; el de la técnica arma el código interno del reporte. */
  @Prop({ type: String })
  codigo?: string;

  /** Color con que se pinta (la severidad). */
  @Prop({ type: String })
  color?: string;

  @Prop({ type: Number, default: 0 })
  orden: number;

  activo?: boolean;
}

export const CatalogoMonitoreoSchema =
  SchemaFactory.createForClass(CatalogoMonitoreo);
CatalogoMonitoreoSchema.plugin(bajaLogica);

/**
 * Único **incluyendo lo dado de baja**: dar de alta un valor que se había
 * dado de baja lo restaura en vez de duplicarlo (ver
 * `MonitoreoCatalogosService.crear`).
 */
CatalogoMonitoreoSchema.index(
  { tipo: 1, valor_normalizado: 1 },
  { unique: true },
);
CatalogoMonitoreoSchema.index({ tipo: 1, orden: 1 });
