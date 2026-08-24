import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '../../modules/auth/auth.module';
import { AutenticacionGuard } from './autenticacion.guard';
import { ExcepcionesFilter } from './excepciones.filter';
import { IdPeticionMiddleware } from './id-peticion.middleware';
import { RegistroInterceptor } from './registro.interceptor';
import { SaludController } from './salud.controller';

/**
 * Chasis transversal de la aplicación.
 *
 * Reúne lo que antes no existía o estaba disperso en `main.ts`: identificador
 * de petición, registro sin datos sensibles, formato único de error,
 * autenticación por defecto, límite de tasa y sondas de salud.
 *
 * Todo se registra con los tokens `APP_*` en vez de en `main.ts` porque así los
 * componentes pasan por el inyector de dependencias y pueden pedir `Reflector`,
 * servicios o configuración. Es el mismo criterio que ya seguía
 * `AuditoriaModule`.
 *
 * ⚠️ El orden de los `APP_GUARD` es el orden de ejecución. `ThrottlerGuard` va
 * primero a propósito: el límite de tasa debe aplicarse **antes** de validar
 * credenciales, o un ataque de fuerza bruta contra `/auth/login` consumiría un
 * ciclo de verificación de contraseña por intento.
 */
@Module({
  imports: [
    TerminusModule,
    // AuthModule aporta la JwtStrategy que consume AutenticacionGuard.
    AuthModule,
    // Un unico limitador. Ojo: ThrottlerGuard aplica TODOS los limitadores
    // declarados aqui a TODAS las rutas — declarar uno estricto "para el login"
    // lo impondria tambien al resto del trafico. Lo estricto se consigue
    // sobrescribiendo este mismo limitador con @Throttle en el handler.
    ThrottlerModule.forRoot([
      {
        // Holgado a proposito: el frontend hace muchas peticiones por pantalla
        // y todas llegan con la misma IP al pasar por el proxy de Next. Su
        // papel es frenar abusos, no moldear el trafico normal.
        ttl: 60_000,
        limit: 600,
      },
    ]),
  ],
  controllers: [SaludController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_INTERCEPTOR, useClass: RegistroInterceptor },
    { provide: APP_FILTER, useClass: ExcepcionesFilter },
  ],
})
export class NucleoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IdPeticionMiddleware).forRoutes('*');
  }
}
