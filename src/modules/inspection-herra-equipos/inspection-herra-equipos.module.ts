import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InspectionHerraEquipos, InspectionHerraEquiposSchema } from './schemas/inspection-herra-equipos.schema';
import { InspectionsHerraEquiposController } from './inspection-herra-equipos.controller';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';
import { EquipmentTrackingModule } from '../equipment-tracking/equipment-tracking.module';
import { ExcelHerraEquipoModule } from './excel-generator/excel-generator-herra.module';
import { TemplateHerraEquiposModule } from '../template-herra-equipos/template-herra-equipos.module';
import { PdfHerraEquipoModule } from './pdf/excel-to-pdf.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InspectionHerraEquipos.name, schema: InspectionHerraEquiposSchema },
    ]),
    EquipmentTrackingModule,
    ExcelHerraEquipoModule,
    TemplateHerraEquiposModule,
    PdfHerraEquipoModule
  ],
  controllers: [InspectionsHerraEquiposController],
  providers: [InspectionsHerraEquiposService],
  exports: [InspectionsHerraEquiposService, MongooseModule], // Si lo necesitas en otros módulos
})
export class InspectionsHerraEquiposModule {}