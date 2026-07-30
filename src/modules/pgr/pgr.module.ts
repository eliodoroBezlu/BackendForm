import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PgrService } from './pgr.service';
import { PgrImportService } from './pgr-import.service';
import { PgrExcelService } from './pgr-excel.service';
import { PgrController } from './pgr.controller';
import { Pgr, PgrSchema } from './schemas/pgr.schema';
import { Area, AreaSchema } from '../area/schema/area.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schema/superintendencia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pgr.name, schema: PgrSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
    ]),
  ],
  controllers: [PgrController],
  providers: [PgrService, PgrImportService, PgrExcelService],
  exports: [PgrService],
})
export class PgrModule {}
