import { Module } from '@nestjs/common';
import { PlanesAccionService } from './planes-accion.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import { PlanesAccionController } from './planes-accion.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { PlanDeAccion, PlanDeAccionSchema } from './schemas/plan-accion.schema';
import { InstancesModule } from '../instances/instances.module';
import { TemplatesModule } from '../templates/templates.module';
import { ConfigModule } from '@nestjs/config';
import { Area, AreaSchema } from '../area/schemas/area.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schemas/superintendencia.schema';
import {
  Trabajador,
  TrabajadorSchema,
} from '../trabajadores/schemas/trabajador.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PlanDeAccion.name, schema: PlanDeAccionSchema },
      // Para el alcance por área (mismo patrón que `pgr` y `matriz-riesgos`:
      // `AreaModule` no exporta su servicio).
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
      { name: Trabajador.name, schema: TrabajadorSchema },
    ]),
    InstancesModule,
    TemplatesModule,
  ],
  controllers: [PlanesAccionController],
  providers: [PlanesAccionService, PlanesAccionExcelService],
  exports: [PlanesAccionService],
})
export class PlanesAccionModule {}
