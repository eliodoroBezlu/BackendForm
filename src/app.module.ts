import { Module, RequestMethod } from '@nestjs/common';
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

import {
  KeycloakConnectModule,
  ResourceGuard,
  RoleGuard,
  AuthGuard,
  PolicyEnforcementMode,
  TokenValidation,
} from 'nest-keycloak-connect';

import { APP_GUARD } from '@nestjs/core';
import { KeycloakModule } from './modules/trabajadores/keycloak.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    HttpModule.register({
      timeout: 60000, // opcional: 60 segundos
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

    KeycloakConnectModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        const authServerUrl = configService.get<string>(
          'KEYCLOAK_AUTH_SERVER_URL',
        );
        const realm = configService.get<string>('KEYCLOAK_REALM');
        const clientId = configService.get<string>('KEYCLOAK_CLIENT_ID');
        const secret = configService.get<string>('KEYCLOAK_SECRET');

        console.log('🔧 Keycloak Configuration:');
        console.log('- Auth Server URL:', authServerUrl);
        console.log('- Realm:', realm);
        console.log('- Client ID:', clientId);
        console.log('- Secret:', secret ? '***configured***' : 'NOT SET');

        // Validar que todas las propiedades requeridas estén presentes
        if (!authServerUrl || !realm || !clientId || !secret) {
          throw new Error(
            'Missing required Keycloak configuration. Please check your environment variables.',
          );
        }

        return {
          authServerUrl,
          realm,
          clientId,
          secret,
          cookieKey: 'KEYCLOAK_JWT',
          logLevels: ['verbose'],
          useNestLogger: true,
          policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
          tokenValidation: TokenValidation.ONLINE,
          bearerOnly: true,
          serverUrl: authServerUrl,
          verifyTokenAudience: false,
          
        };
      },
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
    UploadModule,
    KeycloakModule,
  ],
  providers: [
    // Guards globales de Keycloak
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ResourceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}
