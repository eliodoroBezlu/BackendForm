// area.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { bajaLogica } from '../../../common/baja-logica/baja-logica.plugin';
import { Document, Types } from 'mongoose';
import { Superintendencia } from '../../superintendencia/schemas/superintendencia.schema';

@Schema() // Define que esta clase es un esquema de Mongoose
export class Area extends Document {
  // Código JDE del área — clave de sincronización con el catálogo del IAM
  // Core. Opcional/sparse porque las áreas creadas antes de la sincronización
  // no lo tienen hasta que el sync las empareja por nombre.
  @Prop({ unique: true, sparse: true })
  codigo?: string;

  @Prop({ required: true }) // Define una propiedad con validación "required"
  nombre: string;

  /**
   * Cómo la llama el IAM, cuando difiere del nombre local.
   *
   * El nombre local no se pisa: hay 317 inspecciones que dicen «Taller
   * Soldadura» donde el IAM dice «Taller General», y son la misma área. El
   * emparejamiento va por `codigo`; esto queda para poder explicar la
   * diferencia sin tener que adivinarla.
   */
  @Prop()
  nombreIam?: string;

  @Prop({
    type: Types.ObjectId, // Tipo de dato: ObjectId
    ref: 'Superintendencia', // Referencia a la colección Superintendencia
    required: true,
  })
  superintendencia: Superintendencia; // Relación con Superintendencia

  /**
   * Área de la que ésta es subárea. Auto-referencia: cierra la cadena
   * **Gerencia → Superintendencia → Área → subárea**.
   *
   * El caso que la motivó es «Vías férreas», que en el fondo es parte de
   * «Recursos Hídricos» pero se mantiene aparte porque se le hacen
   * inspecciones propias. Como subárea, el maestro queda alineado con el IAM
   * —que solo conoce Recursos Hídricos (3311)— sin perder el detalle.
   *
   * Las subáreas son locales y no tienen código JDE, así que el sync del IAM
   * nunca las toca.
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Area',
    index: true,
  })
  areaPadre?: Types.ObjectId;

  @Prop({ default: true })
  activo: boolean;

  @Prop()
  creadoPor: string;

  @Prop()
  actualizadoPor: string;
}

export const AreaSchema = SchemaFactory.createForClass(Area); // Crea el esquema

/**
 * Un área no se borra: pasa a inactiva y deja de aparecer en las consultas.
 *
 * Hay inspecciones, equipos y trabajadores que apuntan a ella; borrarla los
 * dejaría señalando a un identificador que ya no existe, y el informe diría
 * «Sin área» sobre inspecciones que sí tenían la suya.
 */
AreaSchema.plugin(bajaLogica);
