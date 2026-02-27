import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelVehicleService } from './vehicle.service';
import { ExcelManLiftService } from './man-lift.service';
import { ExcelEscaleraService } from './escaleras.service';
import { ExcelGruaRemotoService } from './grua-remoto.service';
import { ExcelGruaCabinaService } from './grua-cabina.service';
import { ExcelTaladroService } from './taladro.service';
import { ExcelEquipoSoldarService } from './equipo-soldar.service';
import { ExcelEsmerilService } from './esmeril.service';
import { ExcelAmoladoraService } from './amoladora.service';
import { ExcelCilindrosService } from './cilindros.service';
import { ExcelAndamiosService } from './andamio.service';
import { ExcelFrecuenteTecleService } from './frecuente-tecles.service';
import { ExcelPreUsoTecleService } from './preuso-tecle.service';
import { MongooseModule } from '@nestjs/mongoose';
import { InspectionHerraEquipos, InspectionHerraEquiposSchema } from '../schemas/inspection-herra-equipos.schema';
import { ExcelElementosIzajeService } from './elementos-izaje.service';
import { ExcelArnestService } from './arnes.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: InspectionHerraEquipos.name,
        schema: InspectionHerraEquiposSchema,
      },
    ]),
  ], // Asegura que ConfigModule está disponible
  providers: [
    ExcelVehicleService,
    ExcelManLiftService,
    ExcelEscaleraService,
    ExcelGruaRemotoService,
    ExcelGruaCabinaService,
    ExcelTaladroService,
    ExcelEquipoSoldarService,
    ExcelEsmerilService,
    ExcelAmoladoraService,
    ExcelCilindrosService,
    ExcelAndamiosService,
    ExcelFrecuenteTecleService,
    ExcelPreUsoTecleService,
    ExcelElementosIzajeService,
    ExcelArnestService
  ],
  exports: [
    ExcelVehicleService,
    ExcelManLiftService,
    ExcelEscaleraService,
    ExcelGruaRemotoService,
    ExcelGruaCabinaService,
    ExcelTaladroService,
    ExcelEquipoSoldarService,
    ExcelEsmerilService,
    ExcelAmoladoraService,
    ExcelCilindrosService,
    ExcelAndamiosService,
    ExcelFrecuenteTecleService,
    ExcelPreUsoTecleService,
    ExcelElementosIzajeService, 
    ExcelArnestService
  ],
})
export class ExcelHerraEquipoModule {}
