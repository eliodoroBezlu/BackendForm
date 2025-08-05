import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema()
class SistemaInspeccion {
  @Prop({ type: mongoose.Schema.Types.Mixed })
  cantidad: number | string;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  estado: '✓' | 'X' | 'N/A' | null;

  @Prop()
  observaciones?: string;
}

@Schema()
class SistemasPasivos {
  @Prop({ type: SistemaInspeccion })
  puertasEmergencia: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  senaleticaViasEvacuacion: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  planosEvacuacion: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  registroPersonalEvacuacion: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  numerosEmergencia: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  luzEmergencia: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  puntoReunion: SistemaInspeccion;
}

@Schema()
class SistemasActivos {
  @Prop({ type: SistemaInspeccion })
  kitDerrame: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  lavaOjos: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  duchasEmergencia: SistemaInspeccion;

  @Prop({ type: SistemaInspeccion })
  desfibriladorAutomatico: SistemaInspeccion;
}

@Schema()
class InspeccionSistemasMensual {
  @Prop({ type: SistemasPasivos })
  sistemasPasivos: SistemasPasivos;

  @Prop({ type: SistemasActivos })
  sistemasActivos: SistemasActivos;

  @Prop()
  observaciones?: string;
}

@Schema()
export class InspeccionExtintor {
  @Prop()
  fechaInspeccion: string;

  @Prop()
  codigo: string;

  @Prop()
  ubicacion: string;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  inspeccionMensual: '✓' | 'X' | 'N/A' | null;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  manguera: '✓' | 'X' | 'N/A' | null;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  cilindro: '✓' | 'X' | 'N/A' | null;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  indicadorPresion: '✓' | 'X' | 'N/A' | null;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  gatilloChavetaPrecinto: '✓' | 'X' | 'N/A' | null;

  @Prop({ type: String, enum: ['✓', 'X', 'N/A', null] })
  senalizacionSoporte: '✓' | 'X' | 'N/A' | null;

  @Prop()
  observaciones: string;
}

@Schema()
class Inspector {
  @Prop({ type: String })
  nombre: string;

  @Prop({ type: String })
  firma: string | null;
}

@Schema()
class InspeccionMensual {
  @Prop({ type: InspeccionSistemasMensual })
  inspeccionesActivos: InspeccionSistemasMensual;

  @Prop({ type: [InspeccionExtintor] })
  inspeccionesExtintor: InspeccionExtintor[];

  @Prop({ type: Inspector })
  inspector: Inspector;
}

const InspeccionMensualSchema = SchemaFactory.createForClass(InspeccionMensual);

@Schema()
export class FormularioInspeccionEmergencia extends Document {
  @Prop({ default: '3.02.P01.F17' })
  documentCode: string;

  @Prop({ default: 2 })
  revisionNumber: number;

  @Prop({ required: true })
  superintendencia: string;

  @Prop({ required: true })
  area: string;

  @Prop({ type: String })
  tag: string;

  @Prop({ type: String })
  responsableEdificio: string;

  @Prop({ required: true })
  edificio: string;

  @Prop({
    type: String,
    enum: ['ENERO-JUNIO', 'JULIO-DICIEMBRE'],
    required: true,
  })
  periodo: 'ENERO-JUNIO' | 'JULIO-DICIEMBRE';

  @Prop({ required: true })
  año: number;

  @Prop({
    type: String,
    enum: [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ],
    required: true,
  })
  mesActual:
    | 'ENERO'
    | 'FEBRERO'
    | 'MARZO'
    | 'ABRIL'
    | 'MAYO'
    | 'JUNIO'
    | 'JULIO'
    | 'AGOSTO'
    | 'SEPTIEMBRE'
    | 'OCTUBRE'
    | 'NOVIEMBRE'
    | 'DICIEMBRE';

  @Prop({
    type: Map,
    of: InspeccionMensualSchema, // Usa el esquema generado para InspeccionMensual
  })
  meses: Map<string, InspeccionMensual>;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: Date;

  @Prop({ type: Date, default: Date.now })
  fechaUltimaModificacion: Date;

  @Prop({
    type: String,
    enum: ['activo', 'completado', 'archivado'],
    default: 'activo',
  })
  estado: 'activo' | 'completado' | 'archivado';
}

export const FormularioInspeccionSchema = SchemaFactory.createForClass(
  FormularioInspeccionEmergencia,
);

FormularioInspeccionSchema.index({
  superintendencia: 1,
  area: 1,
  año: 1,
  mesActual: 1,
});
