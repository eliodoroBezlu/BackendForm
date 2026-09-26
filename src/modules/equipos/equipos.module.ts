import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EquiposService } from './equipos.service';
import { MigracionService } from './migracion.service';
import { EquiposExcelService } from './equipos-excel.service';
import { ResolucionOrganizacionalService } from './importacion/resolucion-organizacional.service';
import { EquiposController } from './equipos.controller';
import { Equipo, EquipoSchema } from './schemas/equipo.schema';
import { ConfigFormularioModule } from '../config-formulario/config-formulario.module';
import { UbicacionModule } from '../ubicacion/ubicacion.module';
import { ClasificacionModule } from '../clasificacion/clasificacion.module';
import { Area, AreaSchema } from '../area/schemas/area.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schemas/superintendencia.schema';
import { Gerencia, GerenciaSchema } from '../gerencia/schemas/gerencia.schema';
import {
  Trabajador,
  TrabajadorSchema,
} from '../trabajadores/schemas/trabajador.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Equipo.name, schema: EquipoSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
      { name: Gerencia.name, schema: GerenciaSchema },
      // El importador necesita el roster para saber a qué superintendencia va
      // la camioneta de un superintendente: la hoja solo trae su nombre.
      { name: Trabajador.name, schema: TrabajadorSchema },
    ]),
    ConfigFormularioModule,
    UbicacionModule,
    ClasificacionModule,
  ],
  controllers: [EquiposController],
  providers: [
    EquiposService,
    MigracionService,
    EquiposExcelService,
    ResolucionOrganizacionalService,
  ],
  exports: [EquiposService, MigracionService],
})
export class EquiposModule {}
