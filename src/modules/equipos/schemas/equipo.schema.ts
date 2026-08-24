import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as mongoose from 'mongoose';

/**
 * A qué nivel de la organización pertenece un equipo.
 *
 * No todo equipo es de un área: la camioneta del gerente no está «en
 * Chancado», está con él. El nivel decide **quién lo ve en el selector de
 * inspección**: `area` solo esa área, `superintendencia` cualquiera de sus
 * áreas, `gerencia` cualquiera.
 *
 * Es visibilidad, no permisos: si el usuario puede inspeccionar lo siguen
 * definiendo los roles. Mezclar las dos cosas convertiría «ampliar el ámbito
 * de un equipo» en dar permisos sin querer.
 */
export enum AmbitoEquipo {
  AREA = 'area',
  SUPERINTENDENCIA = 'superintendencia',
  GERENCIA = 'gerencia',
}

/**
 * Una foto del equipo.
 *
 * Se guardan también el nombre original y el peso porque un `url` suelto no
 * dice nada cuando hay que revisar qué se subió o depurar un archivo perdido.
 */
@Schema({ _id: false })
export class FotoEquipo {
  /** Ruta servida por el backend, p. ej. `/uploads/fotos-equipos/abc.jpg`. */
  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String })
  nombre?: string;

  @Prop({ type: String })
  mime?: string;

  @Prop({ type: Number })
  tamano?: number;
}

export const FotoEquipoSchema = SchemaFactory.createForClass(FotoEquipo);

@Schema({ timestamps: true, collection: 'equipos' })
export class Equipo extends Document {
  /**
   * Código legible del equipo — el «ID interno» (`505-D-0026`). Es lo que se
   * muestra y se busca en el formulario de inspección.
   *
   * **No es único**: el inventario de SPCC trae 5 pares de equipos físicamente
   * distintos con el mismo ID interno (distinto RFID, distinta descripción y
   * distinta fecha de fabricación). La identidad de la unidad es `rfid`.
   */
  @Prop({
    type: String,
    required: true,
    index: true,
  })
  codigo: string;

  /**
   * Identificador físico del equipo (RFID EPC). Es la **clave real**: en el
   * inventario de 1.426 SPCC no tiene una sola repetición.
   *
   * `sparse` porque los equipos que no tienen tag RFID —herramientas,
   * vehículos— no lo llevan.
   */
  @Prop({ type: String, unique: true, sparse: true, index: true })
  rfid?: string;

  /**
   * Placa del vehículo. **No es lo mismo que `codigo`**: un vehículo tiene un
   * número interno de flota (`L-266`) y una placa, y son datos distintos.
   *
   * Va aparte porque el formulario de inspección los pide en dos campos
   * separados, y el inventario a veces trae solo uno de los dos: hay vehículos
   * cuyo «Cód. Nuevo Asig» es en realidad la placa.
   *
   * Sin índice único a propósito: es un dato que se carga a mano y una
   * repetición no debe impedir guardar el equipo — la identidad sigue siendo
   * `(codigo, rfid)`.
   */
  @Prop({ type: String, index: true })
  placa?: string;

  @Prop({ type: String })
  codigo_antiguo?: string;

  @Prop({ type: String })
  codigo_parte?: string;

  @Prop({ type: String, required: true })
  descripcion: string;

  @Prop({ type: String })
  marca?: string;

  @Prop({ type: String })
  modelo?: string;

  @Prop({ type: Number, default: 1 })
  cantidad: number;

  @Prop({ type: Number })
  costo?: number;

  @Prop({ type: String })
  num_serie?: string;

  @Prop({ type: String })
  frecuencia_uso?: string;

  @Prop({ type: String })
  estado?: string;

  @Prop({ type: String })
  observaciones?: string;

  @Prop({ type: String, required: true, index: true })
  tipo_equipo: string; // "Escalera", "Amoladora", etc.

  @Prop({
    type: String,
    enum: AmbitoEquipo,
    default: AmbitoEquipo.AREA,
    index: true,
  })
  ambito: AmbitoEquipo;

  /**
   * Área del equipo. **Opcional**: solo se llena cuando `ambito` es `area`.
   * Con ámbito de superintendencia o de gerencia no hay un área a la que
   * pertenezca, y forzar una sería inventar el dato.
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Area',
    index: true,
  })
  area_id?: Types.ObjectId;

  /** Con `ambito: superintendencia` — a cuál pertenece. */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Superintendencia',
    index: true,
  })
  superintendencia_id?: Types.ObjectId;

  /** Con `ambito: gerencia` — a cuál pertenece. */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gerencia',
    index: true,
  })
  gerencia_id?: Types.ObjectId;

  /**
   * Ubicación fina dentro del área: un sector («Taller mecánico de filtros»)
   * o el TAG del equipo de planta donde está montado (`710BL727`). El
   * inventario de SPCC ya la trae y hoy se perdía.
   */
  @Prop({ type: String })
  subarea?: string;

  /** Persona a cargo, cuando el equipo está asignado a alguien. */
  @Prop({ type: String })
  responsable?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ubicacion',
    required: true,
    index: true,
  })
  ubicacion_id: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clasificacion',
    required: true,
    index: true,
  })
  clasificacion_id: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  especificaciones: Record<string, any>; // Atributos dinámicos

  /**
   * Fotos del equipo. **Varias**, porque un arnés se identifica por su etiqueta,
   * su estado general y a veces un detalle concreto, y una sola imagen no da
   * para las tres cosas.
   *
   * La **primera hace de portada**: es la que se muestra en los listados y en
   * el selector de préstamo. El orden del array es el orden que eligió el
   * usuario, así que no se reordena por ningún otro criterio.
   *
   * Solo se guarda la referencia; el archivo vive en `uploads/fotos-equipos`.
   */
  @Prop({ type: [FotoEquipoSchema], default: [] })
  fotos: FotoEquipo[];
}

export type EquipoDocument = Equipo & Document;
export const EquipoSchema = SchemaFactory.createForClass(Equipo);

/**
 * La identidad del equipo es el **par** `(codigo, rfid)` — el equivalente en
 * Mongo a una clave primaria compuesta.
 *
 * Resuelve los dos casos con una sola regla:
 *
 *   - **Con RFID** (los SPCC): dos equipos pueden compartir el ID interno
 *     `505-D-0026` porque el RFID los distingue. Son unidades físicamente
 *     distintas a las que les asignaron el mismo código.
 *   - **Sin RFID** (herramientas, vehículos): el par se reduce a
 *     `(codigo, null)`, así que el código sigue siendo único entre ellos —
 *     exactamente la protección que había antes.
 *
 * El índice único sobre `rfid` solo se mantiene aparte porque un tag físico no
 * puede estar en dos equipos aunque sus códigos difieran.
 */
EquipoSchema.index({ codigo: 1, rfid: 1 }, { unique: true });

// Wildcard index on dynamic specifications field
EquipoSchema.index({ 'especificaciones.$**': 1 });
