import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FirmaModule } from './common/firma/firma.module';
import { AuditoriaModule } from './common/auditoria/auditoria.module';
import { NucleoModule } from './common/nucleo/nucleo.module';
import { validarEntorno } from './common/nucleo/entorno.validacion';
import { PrestamosSpccModule } from './modules/prestamos-spcc/prestamos-spcc.module';
import { LinternasModule } from './modules/linternas/linternas.module';
import { InspeccionesModule } from './modules/inspecciones/inspecciones.module';
import { ExcelModule } from './modules/excel/excel.module';
import { InspeccionesEmergenciaExcelModule } from './modules/inspecciones-emergencia/inspecciones-emergencia-excel/inspecciones-emergencia-excel.module';
import { InspeccionesEmergenciaModule } from './modules/inspecciones-emergencia/inspecciones-emergencia.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { SuperintendenciaModule } from './modules/superintendencia/superintendencia.module';
import { GerenciaModule } from './modules/gerencia/gerencia.module';
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
import { InspectionScheduleModule } from './modules/inspection-schedule/inspection-schedule.module';
import { AuthModule } from './modules/auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PgrModule } from './modules/pgr/pgr.module';
import { MatrizRiesgosModule } from './modules/matriz-riesgos/matriz-riesgos.module';
import { UbicacionModule } from './modules/ubicacion/ubicacion.module';
import { ClasificacionModule } from './modules/clasificacion/clasificacion.module';
import { ConfigBienvenidaModule } from './modules/config-bienvenida/config-bienvenida.module';
import { ConfigFormularioModule } from './modules/config-formulario/config-formulario.module';
import { EquiposModule } from './modules/equipos/equipos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Aborta el arranque si falta una variable imprescindible.
      validate: validarEntorno,
    }),
    // Chasis transversal: id de peticion, registro, errores, auth, salud.
    NucleoModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),

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
    GerenciaModule,
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
    UploadModule,
    InspectionScheduleModule,
    AuthModule,
    PgrModule,
    MatrizRiesgosModule,
    UbicacionModule,
    ClasificacionModule,
    ConfigFormularioModule,
    ConfigBienvenidaModule,
    EquiposModule,
    FirmaModule,
    AuditoriaModule,
    PrestamosSpccModule,
    LinternasModule,
  ],
  providers: [],
})
export class AppModule {}
