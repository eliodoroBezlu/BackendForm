// superintendencia.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';

@Schema({ timestamps: true })
export class Superintendencia extends Document {
  /**
   * Id de la superintendencia en el IAM Core — **la clave de sincronización**.
   *
   * Antes el sync emparejaba por nombre y el IAM escribe «Mec. Plta. Chancado…»
   * donde BackendForm tenía «Mec. Planta Chancado…»: cada arranque creaba una
   * superintendencia duplicada y repuntaba las áreas hacia ella, dejando la
   * vieja huérfana y partiendo los datos en dos vocabularios (los PGR con un
   * nombre, las matrices y el roster con el otro).
   *
   * `sparse` porque las superintendencias propias de BackendForm que no existen
   * en el IAM no lo tienen.
   */
  @Prop({ unique: true, sparse: true })
  idIam?: string;

  /**
   * Cómo la llama el IAM. Se guarda aparte de `nombre` a propósito: el nombre
   * local es el que referencian los PGR, las matrices y el roster ya cargados,
   * y renombrarlo rompería esas referencias de texto.
   */
  @Prop()
  nombreIam?: string;

  @Prop({ required: true })
  nombre: string;

  /**
   * Gerencia a la que pertenece — el eslabón que cierra la cadena
   * **Gerencia → Superintendencia → Área → subárea**.
   *
   * Opcional porque hay superintendencias locales que no cuelgan de ninguna
   * («Superintendencia TO») y porque el catálogo del IAM no expone gerencias:
   * se asigna desde el panel, no la sincroniza nadie.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Gerencia',
    index: true,
  })
  gerencia_id?: Types.ObjectId;

  @Prop({ default: true })
  activo: boolean;

  @Prop()
  creadoPor: string;

  @Prop()
  actualizadoPor: string;
}

export const SuperintendenciaSchema =
  SchemaFactory.createForClass(Superintendencia);

/**
 * No se borra: pasa a inactivo y deja de aparecer en las consultas.
 *
 * De ella cuelgan las areas, y de las areas todo lo demas.
 */
SuperintendenciaSchema.plugin(bajaLogica); // Genera el esquema
