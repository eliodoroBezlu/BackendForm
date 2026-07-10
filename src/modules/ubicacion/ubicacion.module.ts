import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UbicacionService } from './ubicacion.service';
import { UbicacionController } from './ubicacion.controller';
import { Ubicacion, UbicacionSchema } from './schemas/ubicacion.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ubicacion.name, schema: UbicacionSchema }]),
  ],
  controllers: [UbicacionController],
  providers: [UbicacionService],
  exports: [UbicacionService],
})
export class UbicacionModule {}
