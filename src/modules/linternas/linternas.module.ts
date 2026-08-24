import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LinternasService } from './linternas.service';
import { LinternasPdfService } from './linternas-pdf.service';
import { LinternasReportesService } from './linternas-reportes.service';
import { StockLinternasService } from './stock-linternas.service';
import { LinternasController } from './linternas.controller';
import {
  EntregaLinterna,
  EntregaLinternaSchema,
} from './schemas/entrega-linterna.schema';
import {
  IngresoLinterna,
  IngresoLinternaSchema,
  StockLinterna,
  StockLinternaSchema,
} from './schemas/stock-linterna.schema';
import {
  Trabajador,
  TrabajadorSchema,
} from '../trabajadores/schemas/trabajador.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EntregaLinterna.name, schema: EntregaLinternaSchema },
      { name: StockLinterna.name, schema: StockLinternaSchema },
      { name: IngresoLinterna.name, schema: IngresoLinternaSchema },
      // El roster es de dónde salen el área y la superintendencia que se
      // congelan en cada entrega.
      { name: Trabajador.name, schema: TrabajadorSchema },
    ]),
  ],
  controllers: [LinternasController],
  providers: [
    LinternasService,
    StockLinternasService,
    LinternasReportesService,
    LinternasPdfService,
  ],
  exports: [LinternasService],
})
export class LinternasModule {}
