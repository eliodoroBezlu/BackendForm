import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as ErrorDeMongoose } from 'mongoose';

/** Forma única de error que recibe el frontend, pase lo que pase. */
interface RespuestaDeError {
  statusCode: number;
  mensaje: string | string[];
  ruta: string;
  momento: string;
  idPeticion?: string;
}

/** Error de clave duplicada de MongoDB. No es una clase, es un código. */
interface ErrorDeMongo {
  code?: number;
  keyValue?: Record<string, unknown>;
}

const esErrorDeMongo = (e: unknown): e is ErrorDeMongo =>
  typeof e === 'object' && e !== null && 'code' in e;

/**
 * Filtro de excepciones global.
 *
 * Antes cada bloque `catch` decidía su propio formato y lo no atrapado salía
 * como error crudo de Mongoose o de Node —con detalles internos y con formas
 * distintas según dónde reventara—. Aquí se unifica:
 *
 * - `HttpException`  → se respeta su código y su mensaje.
 * - `ValidationError` de Mongoose → 400 con la lista de campos.
 * - `CastError` de Mongoose → 400 («identificador inválido»), en vez del 500
 *   que salía al pasar un ObjectId mal formado.
 * - Clave duplicada (E11000) → 409, que es lo que semánticamente es.
 * - Cualquier otra cosa → 500 con mensaje genérico. **El detalle se registra
 *   en el log del servidor, nunca se devuelve al cliente**: es donde se filtran
 *   rutas de archivos, consultas y estructura interna.
 */
@Catch()
export class ExcepcionesFilter implements ExceptionFilter {
  private readonly logger = new Logger('Excepcion');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const respuesta = ctx.getResponse<Response>();
    const peticion = ctx.getRequest<Request & { idPeticion?: string }>();

    const { estado, mensaje, registrar } = this.traducir(excepcion);

    const cuerpo: RespuestaDeError = {
      statusCode: estado,
      mensaje,
      ruta: peticion.url,
      momento: new Date().toISOString(),
      idPeticion: peticion.idPeticion,
    };

    if (registrar) {
      this.logger.error(
        `${peticion.method} ${peticion.url} → ${estado} [${peticion.idPeticion ?? 's/id'}]`,
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    }

    respuesta.status(estado).json(cuerpo);
  }

  private traducir(excepcion: unknown): {
    estado: number;
    mensaje: string | string[];
    registrar: boolean;
  } {
    if (excepcion instanceof HttpException) {
      const cuerpo = excepcion.getResponse();
      const mensaje =
        typeof cuerpo === 'string'
          ? cuerpo
          : ((cuerpo as { message?: string | string[] }).message ??
            excepcion.message);

      return {
        estado: excepcion.getStatus(),
        mensaje,
        // Los 5xx sí interesan en el log; los 4xx son ruido esperado.
        registrar: excepcion.getStatus() >= 500,
      };
    }

    if (excepcion instanceof ErrorDeMongoose.ValidationError) {
      return {
        estado: HttpStatus.BAD_REQUEST,
        mensaje: Object.values(excepcion.errors).map((e) => e.message),
        registrar: false,
      };
    }

    if (excepcion instanceof ErrorDeMongoose.CastError) {
      return {
        estado: HttpStatus.BAD_REQUEST,
        mensaje: `Identificador inválido para el campo «${excepcion.path}»`,
        registrar: false,
      };
    }

    if (esErrorDeMongo(excepcion) && excepcion.code === 11000) {
      const campos = Object.keys(excepcion.keyValue ?? {}).join(', ');
      return {
        estado: HttpStatus.CONFLICT,
        mensaje: campos
          ? `Ya existe un registro con ese valor en: ${campos}`
          : 'Ya existe un registro con esos datos',
        registrar: false,
      };
    }

    return {
      estado: HttpStatus.INTERNAL_SERVER_ERROR,
      mensaje: 'Error interno del servidor',
      registrar: true,
    };
  }
}
