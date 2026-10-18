import { Module } from '@nestjs/common';
import { ServicioFormulariosController } from './servicio-formularios.controller';
import { ServicioFormulariosService } from './servicio-formularios.service';

@Module({
  controllers: [ServicioFormulariosController],
  providers: [ServicioFormulariosService],
})
export class ServicioFormulariosModule {}
