import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposSchema,
} from './schemas/inspection-herra-equipos.schema';
import { InspectionsHerraEquiposController } from './inspection-herra-equipos.controller';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { InspectionHerraEquiposDocumentService } from './inspection-herra-equipos-document.service';
import { EquipmentTrackingModule } from '../equipment-tracking/equipment-tracking.module';
import { ExcelHerraEquipoModule } from './excel-generator/excel-generator-herra.module';
import { TemplateHerraEquiposModule } from '../template-herra-equipos/template-herra-equipos.module';
import { PdfHerraEquipoModule } from './pdf/excel-to-pdf.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: InspectionHerraEquipos.name,
        schema: InspectionHerraEquiposSchema,
      },
    ]),
    EquipmentTrackingModule,
    ExcelHerraEquipoModule,
    TemplateHerraEquiposModule,
    PdfHerraEquipoModule,
    CommonModule,
  ],
  controllers: [InspectionsHerraEquiposController],
  providers: [
    InspectionsHerraEquiposService,
    InspectionHerraEquiposDocumentService,
  ],
  exports: [InspectionsHerraEquiposService, MongooseModule], // Si lo necesitas en otros módulos
})
export class InspectionsHerraEquiposModule {}
