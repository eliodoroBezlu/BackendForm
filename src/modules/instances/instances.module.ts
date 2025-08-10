import { Module } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { InstancesController } from './instances.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Instance, InstanceSchema } from './schemas/instance.schema';
import { TemplatesModule } from '../templates/templates.module';
import { ExcelIsoIroModule } from './excel-generator/excel-generator.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Instance.name, schema: InstanceSchema },
    ]),
    TemplatesModule,
    ExcelIsoIroModule
  ],

  controllers: [InstancesController],
  providers: [InstancesService],
  exports: [InstancesService],
})
export class InstancesModule {}
