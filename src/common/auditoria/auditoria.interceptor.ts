import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { Types } from 'mongoose';
import { AuditoriaService } from './auditoria.service';
import { RECURSO_AUDITORIA, SIN_AUDITORIA } from './auditoria.decorators';
import { sanearCuerpo } from './sanitizar';

/** Solo se audita lo que cambia algo. Leer es el 90 % del tráfico. */
const METODOS_AUDITADOS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface UsuarioPeticion {
  username?: string;
  roles?: string[];
}

/**
 * Registra en la bitácora toda petición que modifica algo.
 *
 * Va montado globalmente, así que **ningún módulo tiene que colaborar**: lo que
 * se añada al sistema queda auditado por existir. Esa es justo la razón de
 * hacerlo aquí y no repartido por los servicios, donde cada módulo nuevo era
 * una oportunidad de olvidarlo.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly auditoria: AuditoriaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();

    const peticion = contexto.switchToHttp().getRequest<Request>();

    if (!METODOS_AUDITADOS.has(peticion.method)) return siguiente.handle();

    const excluido = this.reflector.getAllAndOverride<boolean>(SIN_AUDITORIA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (excluido) return siguiente.handle();

    const inicio = Date.now();

    return siguiente.handle().pipe(
      tap({
        next: (resultado) => {
          const respuesta = contexto.switchToHttp().getResponse<Response>();
          void this.anotar(contexto, peticion, inicio, {
            estado: respuesta.statusCode,
            resultado,
          });
        },
        error: (error: unknown) => {
          void this.anotar(contexto, peticion, inicio, {
            estado: this.estadoDeError(error),
            error,
          });
        },
      }),
    );
  }

  private async anotar(
    contexto: ExecutionContext,
    peticion: Request,
    inicio: number,
    desenlace: { estado: number; resultado?: unknown; error?: unknown },
  ): Promise<void> {
    const usuario = (peticion as Request & { user?: UsuarioPeticion }).user;

    await this.auditoria.registrar({
      usuario: usuario?.username ?? 'anonimo',
      roles: usuario?.roles ?? [],
      metodo: peticion.method,
      ruta: peticion.path,
      recurso: this.recurso(contexto, peticion),
      documentoId: this.documentoId(peticion, desenlace.resultado),
      estado: desenlace.estado,
      fallo: !!desenlace.error,
      mensajeError: desenlace.error ? this.mensaje(desenlace.error) : undefined,
      datos: this.datos(peticion),
      ip: peticion.ip,
      userAgent: peticion.get('user-agent'),
      duracionMs: Date.now() - inicio,
      fecha: new Date(),
    });
  }

  /**
   * Nombre de lo que se tocó. El endpoint puede declararlo con `@Auditar`; si
   * no, se toma el primer segmento de la ruta, que en este proyecto ya nombra
   * el módulo (`/linternas/...`, `/planes-accion/...`).
   */
  private recurso(contexto: ExecutionContext, peticion: Request): string {
    const declarado = this.reflector.getAllAndOverride<string>(
      RECURSO_AUDITORIA,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (declarado) return declarado;

    return peticion.path.split('/').filter(Boolean)[0] ?? 'desconocido';
  }

  /**
   * Documento afectado: el `:id` de la ruta, o —en un alta, donde todavía no
   * existía— el que devuelve la respuesta.
   */
  private documentoId(
    peticion: Request,
    resultado?: unknown,
  ): string | undefined {
    const params = peticion.params ?? {};
    const deRuta = params.id ?? params._id;
    if (typeof deRuta === 'string' && deRuta) return deRuta;

    if (resultado && typeof resultado === 'object') {
      const cuerpo = resultado as Record<string, unknown>;
      const id = cuerpo._id ?? cuerpo.id;
      if (typeof id === 'string') return id;
      // Un `ObjectId` de Mongo llega como objeto; su `toString` sí da el hex,
      // a diferencia del de un objeto plano, que daría «[object Object]».
      if (id instanceof Types.ObjectId) return id.toHexString();
    }
    return undefined;
  }

  /**
   * Una subida de archivos no guarda cuerpo: es binario troceado y no dice
   * nada. Se anota el archivo por su nombre y su peso.
   */
  private datos(peticion: Request): Record<string, unknown> | undefined {
    const tipo = peticion.get('content-type') ?? '';
    if (tipo.includes('multipart/form-data')) {
      const archivo = (
        peticion as Request & {
          file?: { originalname?: string; size?: number };
        }
      ).file;
      return archivo
        ? { archivo: archivo.originalname, bytes: archivo.size }
        : { archivo: '(subida)' };
    }
    return sanearCuerpo(peticion.body);
  }

  private estadoDeError(error: unknown): number {
    if (error && typeof error === 'object' && 'getStatus' in error) {
      const obtener = (error as { getStatus: () => number }).getStatus;
      if (typeof obtener === 'function') {
        return (error as { getStatus: () => number }).getStatus();
      }
    }
    return 500;
  }

  private mensaje(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
