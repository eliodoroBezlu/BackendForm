import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { InspectionHerraEquipos, InspectionHerraEquiposSchema } from '../schemas/inspection-herra-equipos.schema';
import { ExcelToPdfService } from './excel-to-pdf.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      {
        name: InspectionHerraEquipos.name,
        schema: InspectionHerraEquiposSchema,
      },
    ]),
  ], // Asegura que ConfigModule está disponible
  providers: [
    ExcelToPdfService
  ],
  exports: [
     ExcelToPdfService
  ],
})
export class PdfHerraEquipoModule {}
