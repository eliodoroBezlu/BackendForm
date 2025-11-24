import { Module } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { InstancesController } from './instances.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Instance, InstanceSchema } from './schemas/instance.schema';
import { TemplatesModule } from '../templates/templates.module';
import { ExcelIsoIroModule } from './excel-generator/excel-generator.module';
import { PdfHerraEquipoModule } from '../inspection-herra-equipos/pdf/excel-to-pdf.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Instance.name, schema: InstanceSchema },
    ]),
    TemplatesModule,
    ExcelIsoIroModule,
    PdfHerraEquipoModule
  ],

  controllers: [InstancesController],
  providers: [InstancesService],
  exports: [InstancesService, MongooseModule],
})
export class InstancesModule {}
