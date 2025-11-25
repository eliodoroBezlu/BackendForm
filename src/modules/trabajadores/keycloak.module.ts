// keycloak/keycloak.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KeycloakAdminService } from './keycloack-admin-service.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  providers: [KeycloakAdminService],
  exports: [KeycloakAdminService], // Importante: exportar el servicio
})
export class KeycloakModule {}