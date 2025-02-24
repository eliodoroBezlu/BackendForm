import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class InformacionGeneral {
  @Prop()
  superintendencia: string;

  @Prop()
  trabajador: string;

  @Prop()
  supervisor: string;

  @Prop()
  area: string;

  @Prop({ index: true })
  numInspeccion: string;

  @Prop()
  codConector: string;

  @Prop()
  codArnes: string;

  @Prop({ type: Date, index: true })
  fecha: Date;
}

@Schema()
export class InspeccionItem {
  @Prop()
  id: string;

  @Prop()
  description: string;

  @Prop({ type: String, enum: ['si', 'no', 'na', null] }) // Especificar el tipo 'String' y luego usar 'enum'
  response: 'si' | 'no' | 'na' | null;

  @Prop()
  observation: string;
}

@Schema()
export class InspeccionSeccion {
  @Prop()
  id: string;

  @Prop()
  category: string;

  @Prop({ type: [InspeccionItem] })
  items: InspeccionItem[];
}

@Schema()
class InspectionTitle {
  @Prop()
  id: string

  @Prop()
  title: string

  @Prop({ type: [InspeccionSeccion] })
  items: InspeccionSeccion[]
}

@Schema()
export class Inspeccion extends Document {
  @Prop()
  documentCode: string

  @Prop()
  revisionNumber: number

  @Prop({ type: InformacionGeneral })
  informacionGeneral: InformacionGeneral;

  @Prop({ type: [InspectionTitle] })
  resultados: InspectionTitle[];

  
  @Prop({ type: String, enum: ['SI', 'NO', null] })
  operativo: "SI" | "NO" | null

  @Prop()
  observacionesComplementarias: string;
  
  @Prop()
  inspectionConductedBy: string

  @Prop()
  firmaInspector: string;

  @Prop()
  inspectionApprovedBy: string

  @Prop()
  firmaSupervisor: string;

  @Prop({ type: Date })
  reviewDate: Date

  @Prop({ default: Date.now, index: true })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const InspeccionSchema = SchemaFactory.createForClass(Inspeccion);

InspeccionSchema.index({
  'informacionGeneral.numInspeccion': 1,
  createdAt: -1,
});
