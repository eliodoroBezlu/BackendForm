import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UbicacionService } from './ubicacion.service';
import { UbicacionController } from './ubicacion.controller';
import { Ubicacion, UbicacionSchema } from './schemas/ubicacion.schema';
import { Equipo, EquipoSchema } from '../equipos/schemas/equipo.schema';

@Module({
  imports: [
    // El modelo de equipos se registra aquí y no importando EquiposModule,
    // que ya importa este módulo (el importador usa UbicacionService).
    // Mismo recurso que PrestamosSpccModule.
    MongooseModule.forFeature([
      { name: Ubicacion.name, schema: UbicacionSchema },
      { name: Equipo.name, schema: EquipoSchema },
    ]),
  ],
  controllers: [UbicacionController],
  providers: [UbicacionService],
  exports: [UbicacionService],
})
export class UbicacionModule {}
