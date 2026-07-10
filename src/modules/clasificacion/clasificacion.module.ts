import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClasificacionService } from './clasificacion.service';
import { ClasificacionController } from './clasificacion.controller';
import { Clasificacion, ClasificacionSchema } from './schemas/clasificacion.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Clasificacion.name, schema: ClasificacionSchema }]),
  ],
  controllers: [ClasificacionController],
  providers: [ClasificacionService],
  exports: [ClasificacionService],
})
export class ClasificacionModule {}
