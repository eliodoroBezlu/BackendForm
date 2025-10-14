import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelAislamientoervice } from './excel-generator-aislamiento.service';
import { ExcelCalienteService } from './excel-generator.service';
import { ExcelIzajeService } from './excel-generator-izaje.service';
import { ExcelSustanciasService } from './excel-generator-sustancias.service';
import { ExcelElectricoActosService } from './excel-generator-electrcio-actos.service';
import { ExcelAlturav3Service } from './excel-generator-alturav3.service';
import { ExcelConfinadoService } from './excel-generator-confinado.service';
import { ExcelElectricoCondicionesService } from './excel-generator-electrcio-condiciones.service';
import { ExcelAlturav4Service } from './excel-generator-alturav4.service';
import { ExcelIsopV7Service } from './excel-generator-isop.service';

@Module({
  imports: [ConfigModule], // Asegura que ConfigModule está disponible
  providers: [
    ExcelCalienteService,
    ExcelAislamientoervice,
    ExcelIzajeService,
    ExcelSustanciasService,
    ExcelElectricoActosService,
    ExcelAlturav3Service,
    ExcelConfinadoService,
    ExcelElectricoCondicionesService,
    ExcelAlturav4Service,
    ExcelIsopV7Service
  ],
  exports: [
    ExcelCalienteService,
    ExcelAislamientoervice,
    ExcelIzajeService,
    ExcelSustanciasService,
    ExcelElectricoActosService,
    ExcelAlturav3Service,
    ExcelConfinadoService,
    ExcelElectricoCondicionesService,
    ExcelAlturav4Service,
    ExcelIsopV7Service
  ],
})
export class ExcelIsoIroModule {}
