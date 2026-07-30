import { Module } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { InspeccionesEmergenciaController } from './inspecciones-emergencia.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FormularioInspeccionEmergencia,
  FormularioInspeccionSchema,
} from './schemas/inspeccion-emergencia.schema';
import { InspeccionesEmergenciaExcelModule } from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.module';
import { InspeccionesEmergenciaDocumentService } from './inspecciones-emergencia-document.service';
import { ExtintorModule } from '../extintor/extintor.module';
import { AreaModule } from '../area/area.module';
import { Area, AreaSchema } from '../area/schema/area.schema';
import { PdfHerraEquipoModule } from '../inspection-herra-equipos/pdf/excel-to-pdf.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: FormularioInspeccionEmergencia.name,
        schema: FormularioInspeccionSchema,
      },
      { name: Area.name, schema: AreaSchema },
    ]),
    InspeccionesEmergenciaExcelModule,
    ExtintorModule,
    AreaModule,
    PdfHerraEquipoModule,
    CommonModule,
  ],
  controllers: [InspeccionesEmergenciaController],
  providers: [
    InspeccionesEmergenciaService,
    InspeccionesEmergenciaDocumentService,
  ],
})
export class InspeccionesEmergenciaModule {}
