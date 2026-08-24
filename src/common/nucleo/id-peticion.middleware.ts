import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const CABECERA_ID_PETICION = 'x-request-id';

declare module 'express' {
  interface Request {
    idPeticion?: string;
  }
}

/**
 * Asigna un identificador único a cada petición.
 *
 * Es un **middleware** y no un interceptor a propósito: los interceptores
 * corren *después* de los guards, así que una petición rechazada por
 * autenticación se quedaría sin identificador — justo el caso que más interesa
 * poder rastrear.
 *
 * Si el cliente (o un proxy delante) ya mandó `x-request-id`, se respeta. Así
 * la traza se mantiene entera al atravesar varios servicios.
 */
@Injectable()
export class IdPeticionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const entrante = req.headers[CABECERA_ID_PETICION];
    const id =
      typeof entrante === 'string' && entrante ? entrante : randomUUID();

    req.idPeticion = id;
    res.setHeader(CABECERA_ID_PETICION, id);
    next();
  }
}
