import { Module } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { InstancesController } from './instances.controller';
import { InstancesDocumentService } from './instances-document.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Instance, InstanceSchema } from './schemas/instance.schema';
import { TemplatesModule } from '../templates/templates.module';
import { ExcelIsoIroModule } from './excel-generator/excel-generator.module';
import { PdfHerraEquipoModule } from '../inspection-herra-equipos/pdf/excel-to-pdf.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Instance.name, schema: InstanceSchema },
    ]),
    TemplatesModule,
    ExcelIsoIroModule,
    PdfHerraEquipoModule,
    CommonModule,
  ],

  controllers: [InstancesController],
  providers: [InstancesService, InstancesDocumentService],
  exports: [InstancesService, MongooseModule],
})
export class InstancesModule {}
