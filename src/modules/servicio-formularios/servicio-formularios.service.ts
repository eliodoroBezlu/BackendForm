import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../auth/enums/role.enum';

/**
 * forms como sistema anfitrión del servicio de formularios
 * (`D:\tesisSanCristobal\servicio-formularios`, docs/integracion.md).
 *
 * El servicio no tiene usuarios propios: confía en un token corto que firma
 * el anfitrión con HS256 y la clave secreta de su proyecto, con el `kid` de
 * esa clave en la cabecera. Aquí se firma ese token para el usuario de la
 * sesión. **El secreto nunca sale de este servidor**: al navegador solo le
 * llega el token, que vence en 15 minutos.
 */

/** Corto a propósito: el servicio rechaza cualquier token de más de una hora. */
export const VIDA_DEL_TOKEN_SEGUNDOS = 15 * 60;

export interface UsuarioDeForms {
  /** UUID del IAM: el mismo `sub` con el que forms identifica a la persona. */
  id: string;
  username?: string | null;
  roles: string[];
}

/**
 * Los roles de forms tal cual, más `admin` para quien es `super_admin`: el
 * servicio solo deja configurar el proyecto a `admin`, y un `super_admin` de
 * forms tiene que poder hacerlo.
 */
export function rolesParaElServicio(roles: readonly string[]): string[] {
  const resultado = new Set(roles);
  if (resultado.has(Role.SUPER_ADMIN)) resultado.add(Role.ADMIN);
  return [...resultado];
}

/**
 * El origen (`esquema://host:puerto`) del frontend de forms, o null si la
 * variable falta o no es una URL: se ignora en vez de firmar algo que la web
 * nunca va a poder igualar.
 */
export function origenDelAnfitrion(valor?: string): string | null {
  if (!valor?.trim()) return null;
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ServicioFormulariosService {
  private readonly jwt = new JwtService();

  constructor(private readonly config: ConfigService) {}

  emitirToken(usuario: UsuarioDeForms): { token: string; venceEn: string } {
    const kid = this.config.get<string>('FORMULARIOS_KID')?.trim();
    const secreto = this.config.get<string>('FORMULARIOS_SECRETO')?.trim();
    if (!kid || !secreto) {
      throw new ServiceUnavailableException(
        'El servicio de formularios no está configurado en este servidor: faltan FORMULARIOS_KID o FORMULARIOS_SECRETO',
      );
    }
    const origen = origenDelAnfitrion(
      this.config.get<string>('FORMULARIOS_ORIGEN_ANFITRION'),
    );

    const token = this.jwt.sign(
      {
        sub: usuario.id,
        ...(usuario.username ? { nombre: usuario.username } : {}),
        roles: rolesParaElServicio(usuario.roles),
        // La web del servicio solo le pide un token nuevo a la ventana de
        // este origen (docs/integracion.md §5). Sin él, el token sirve igual
        // pero no se renueva: a los 15 minutos hay que volver a abrirla.
        ...(origen ? { origen } : {}),
      },
      {
        secret: secreto,
        algorithm: 'HS256',
        keyid: kid,
        expiresIn: VIDA_DEL_TOKEN_SEGUNDOS,
      },
    );
    return {
      token,
      venceEn: new Date(
        Date.now() + VIDA_DEL_TOKEN_SEGUNDOS * 1000,
      ).toISOString(),
    };
  }
}
