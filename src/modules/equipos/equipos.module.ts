import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EquiposService } from './equipos.service';
import { MigracionService } from './migracion.service';
import { EquiposController } from './equipos.controller';
import { Equipo, EquipoSchema } from './schemas/equipo.schema';
import { ConfigFormularioModule } from '../config-formulario/config-formulario.module';
import { UbicacionModule } from '../ubicacion/ubicacion.module';
import { ClasificacionModule } from '../clasificacion/clasificacion.module';
import { Area, AreaSchema } from '../area/schema/area.schema';
import { Superintendencia, SuperintendenciaSchema } from '../superintendencia/schema/superintendencia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Equipo.name, schema: EquipoSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
    ]),
    ConfigFormularioModule,
    UbicacionModule,
    ClasificacionModule,
  ],
  controllers: [EquiposController],
  providers: [EquiposService, MigracionService],
  exports: [EquiposService, MigracionService],
})
export class EquiposModule {}
