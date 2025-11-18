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

@Module({
  imports: [ConfigModule], // Asegura que ConfigModule está disponible
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
  ],
})
export class ExcelHerraEquipoModule {}
