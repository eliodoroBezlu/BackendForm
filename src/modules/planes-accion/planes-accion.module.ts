import { Module } from '@nestjs/common';
import { PlanesAccionService } from './planes-accion.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import { PlanesAccionController } from './planes-accion.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { PlanDeAccion, PlanDeAccionSchema } from './schemas/plan-accion.schema';
import { InstancesModule } from '../instances/instances.module';
import { TemplatesModule } from '../templates/templates.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PlanDeAccion.name, schema: PlanDeAccionSchema },
    ]),
    InstancesModule,
    TemplatesModule,
  ],
  controllers: [PlanesAccionController],
  providers: [PlanesAccionService, PlanesAccionExcelService],
  exports: [PlanesAccionService],
})
export class PlanesAccionModule {}
