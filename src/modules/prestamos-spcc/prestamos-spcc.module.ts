import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SolicitudPrestamo,
  SolicitudPrestamoSchema,
} from './schemas/solicitud-prestamo.schema';
import {
  PrestamoSpcc,
  PrestamoSpccSchema,
} from './schemas/prestamo-spcc.schema';
import { Equipo, EquipoSchema } from '../equipos/schemas/equipo.schema';
import { PrestamosSpccService } from './prestamos-spcc.service';
import { PrestamosReportesService } from './prestamos-reportes.service';
import { PrestamosPdfService } from './prestamos-pdf.service';
import { PrestamosSpccController } from './prestamos-spcc.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SolicitudPrestamo.name, schema: SolicitudPrestamoSchema },
      { name: PrestamoSpcc.name, schema: PrestamoSpccSchema },
      { name: Equipo.name, schema: EquipoSchema },
    ]),
  ],
  controllers: [PrestamosSpccController],
  providers: [
    PrestamosSpccService,
    PrestamosReportesService,
    PrestamosPdfService,
  ],
  exports: [PrestamosSpccService],
})
export class PrestamosSpccModule {}
