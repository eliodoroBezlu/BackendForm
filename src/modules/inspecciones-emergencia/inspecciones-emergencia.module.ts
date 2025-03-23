import { Module } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { InspeccionesEmergenciaController } from './inspecciones-emergencia.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {FormularioInspeccionEmergencia, FormularioInspeccionSchema  } from './schemas/inspeccion-emergencia.schema'
import {InspeccionesEmergenciaExcelModule} from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.module'
import { ExtintorModule } from '../extintor/extintor.module';
import { AreaModule } from '../area/area.module';
import { Area, AreaSchema } from '../area/schema/area.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: FormularioInspeccionEmergencia.name, schema: FormularioInspeccionSchema },{ name: Area.name, schema: AreaSchema },]), InspeccionesEmergenciaExcelModule,ExtintorModule, AreaModule],
  controllers: [InspeccionesEmergenciaController],
  providers: [InspeccionesEmergenciaService],
})
export class InspeccionesEmergenciaModule {}
