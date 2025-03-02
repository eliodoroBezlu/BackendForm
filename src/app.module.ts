import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { InspeccionesModule } from "./modules/inspecciones/inspecciones.module"
import { ExcelModule } from "./modules/excel/excel.module"
import { InspeccionesEmergenciaModule } from './modules/inspecciones-emergencia/inspecciones-emergencia.module';

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
  ],
})
export class AppModule {}
