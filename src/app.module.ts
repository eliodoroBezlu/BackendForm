import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { InspeccionesModule } from "./modules/inspecciones/inspecciones.module"
import { ExcelModule } from "./modules/excel/excel.module"
import { InspeccionesEmergenciaExcelModule } from './modules/inspecciones-emergencia/inspecciones-emergencia-excel/inspecciones-emergencia-excel.module'
import { InspeccionesEmergenciaModule } from './modules/inspecciones-emergencia/inspecciones-emergencia.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { SuperintendenciaModule } from './modules/superintendencia/superintendencia.module';
import { AreaModule } from './modules/area/area.module';
import { ExtintorModule } from './modules/extintor/extintor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las configuraciones estén disponibles globalmente
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URI"),
      }),
      inject: [ConfigService],
    }),
    InspeccionesModule,
    ExcelModule,
    InspeccionesEmergenciaModule,
    TrabajadoresModule,
    InspeccionesEmergenciaExcelModule,
    SuperintendenciaModule,
    AreaModule,
    ExtintorModule,
  ],
})
export class AppModule {}
