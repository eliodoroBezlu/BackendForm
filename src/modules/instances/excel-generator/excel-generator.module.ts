import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelAislamientoervice } from './excel-generator-aislamiento.service';
import { ExcelCalienteService } from './excel-generator.service';
import { ExcelIzajeService } from './excel-generator-izaje.service';
import { ExcelSustanciasService } from './excel-generator-sustancias.service';
import { ExcelElectricoActosService } from './excel-generator-electrcio-actos.service';
import { ExcelAlturaService } from './excel-generator-altura.service';
import { ExcelConfinadoService } from './excel-generator-confinado.service';
import { ExcelElectricoCondicionesService } from './excel-generator-electrcio-condiciones.service';

@Module({
  imports: [ConfigModule], // Asegura que ConfigModule está disponible
  providers: [
    ExcelCalienteService,
    ExcelAislamientoervice,
    ExcelIzajeService,
    ExcelSustanciasService,
    ExcelElectricoActosService,
    ExcelAlturaService,
    ExcelConfinadoService,
    ExcelElectricoCondicionesService
  ],
  exports: [
    ExcelCalienteService,
    ExcelAislamientoervice,
    ExcelIzajeService,
    ExcelSustanciasService,
    ExcelElectricoActosService,
    ExcelAlturaService,
    ExcelConfinadoService,
    ExcelElectricoCondicionesService
  ],
})
export class ExcelIsoIroModule {}
