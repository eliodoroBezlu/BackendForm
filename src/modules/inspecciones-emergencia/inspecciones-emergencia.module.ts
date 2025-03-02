import { Module } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { InspeccionesEmergenciaController } from './inspecciones-emergencia.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {FormularioInspeccionEmergencia, FormularioInspeccionSchema  } from "./schemas/inspeccion-emergencia.schema"

@Module({
  imports: [MongooseModule.forFeature([{ name: FormularioInspeccionEmergencia.name, schema: FormularioInspeccionSchema }])],
  controllers: [InspeccionesEmergenciaController],
  providers: [InspeccionesEmergenciaService],
})
export class InspeccionesEmergenciaModule {}
