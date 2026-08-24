import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Auditoria, AuditoriaSchema } from './auditoria.schema';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaInterceptor } from './auditoria.interceptor';

/**
 * Auditoría del sistema entero.
 *
 * El interceptor se registra con `APP_INTERCEPTOR` —y no en `main.ts`— porque
 * así lo construye el contenedor de Nest y puede recibir por inyección el
 * servicio y el `Reflector`. Montado globalmente, cubre cualquier módulo
 * presente o futuro sin que este tenga que enterarse.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auditoria.name, schema: AuditoriaSchema },
    ]),
  ],
  controllers: [AuditoriaController],
  providers: [
    AuditoriaService,
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
