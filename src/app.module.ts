import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InspeccionesModule } from './modules/inspecciones/inspecciones.module';
import { ExcelModule } from './modules/excel/excel.module';
import { InspeccionesEmergenciaExcelModule } from './modules/inspecciones-emergencia/inspecciones-emergencia-excel/inspecciones-emergencia-excel.module';
import { InspeccionesEmergenciaModule } from './modules/inspecciones-emergencia/inspecciones-emergencia.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { SuperintendenciaModule } from './modules/superintendencia/superintendencia.module';
import { AreaModule } from './modules/area/area.module';
import { ExtintorModule } from './modules/extintor/extintor.module';
import { TagModule } from './modules/tag/tag.module';
import { QrGeneratorModule } from './modules/qr-generator/qr-generator.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { InstancesModule } from './modules/instances/instances.module';
import { TemplateHerraEquiposModule } from './modules/template-herra-equipos/template-herra-equipos.module';
import { InspectionsHerraEquiposModule } from './modules/inspection-herra-equipos/inspection-herra-equipos.module';
import { EquipmentTrackingModule } from './modules/equipment-tracking/equipment-tracking.module';
import { MLRecommendationsModule } from './modules/ml-recomendations/ml-recomendations.module';
import { PlanesAccionModule } from './modules/planes-accion/planes-accion.module';
import { UploadModule } from './modules/upload/upload.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    HttpModule.register({
      timeout: 60000,        // opcional: 60 segundos
      maxRedirects: 5,
    }),

    // Configuración de MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Módulos de la aplicación
    InspeccionesModule,
    ExcelModule,
    InspeccionesEmergenciaModule,
    TrabajadoresModule,
    InspeccionesEmergenciaExcelModule,
    SuperintendenciaModule,
    AreaModule,
    ExtintorModule,
    TagModule,
    QrGeneratorModule,
    TemplatesModule,
    InstancesModule,
    TemplateHerraEquiposModule,
    InspectionsHerraEquiposModule,
    EquipmentTrackingModule,
    MLRecommendationsModule,
    PlanesAccionModule,
    UploadModule
  ],
  providers: [],
})
export class AppModule {}