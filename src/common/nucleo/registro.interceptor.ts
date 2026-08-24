import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** A partir de aquí una petición se considera lenta y se registra como aviso. */
const UMBRAL_LENTITUD_MS = 3000;

/**
 * Registro de peticiones.
 *
 * Sustituye al middleware que había en `main.ts`, que imprimía el cuerpo y las
 * cookies de cada petición —es decir, contraseñas y tokens en texto plano—.
 *
 * Aquí se registra **solo metadatos**: método, ruta, estado, duración,
 * identificador de petición y usuario autenticado si lo hay. Nunca el cuerpo,
 * nunca las cabeceras, nunca las cookies.
 */
@Injectable()
export class RegistroInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Peticion');

  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();

    const http = contexto.switchToHttp();
    const peticion = http.getRequest<
      Request & { idPeticion?: string; user?: { username?: string } }
    >();
    const inicio = Date.now();

    return siguiente.handle().pipe(
      tap({
        next: () =>
          this.registrar(peticion, http.getResponse<Response>(), inicio),
        // Los errores los registra ExcepcionesFilter; aquí solo el camino feliz,
        // para no duplicar cada fallo en dos líneas de log.
      }),
    );
  }

  private registrar(
    peticion: Request & { idPeticion?: string; user?: { username?: string } },
    respuesta: Response,
    inicio: number,
  ): void {
    const duracion = Date.now() - inicio;
    const usuario = peticion.user?.username ?? 'anonimo';
    const linea =
      `${peticion.method} ${peticion.url} → ${respuesta.statusCode} ` +
      `${duracion}ms [${peticion.idPeticion ?? 's/id'}] ${usuario}`;

    if (duracion >= UMBRAL_LENTITUD_MS) {
      this.logger.warn(`LENTA ${linea}`);
      return;
    }

    this.logger.log(linea);
  }
}
