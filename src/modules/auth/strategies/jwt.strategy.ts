/**
 * JwtStrategy — BackendForm integrado con IAM Core
 * ─────────────────────────────────────────────────
 * Valida el JWT emitido por IAM Core usando su clave pública RSA-2048.
 * La clave se obtiene automáticamente del JWKS endpoint de IAM Core
 * y se cachea localmente → cero latencia extra por request.
 *
 * Ya NO consulta MongoDB para validar al usuario.
 * El JWT de IAM Core es la fuente de verdad de identidad.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { RbacCacheService } from '../rbac-cache.service';

interface IamJwtPayload {
  sub: string; // IAM Core UUID
  username: string;
  email?: string;
  roles: string[];
  services: string[];
  service_roles?: Record<string, string[]>; // roles genéricos por servicio (RBAC)
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  /** Solo en los tokens temporales del login. */
  type?: string;
}

/** Destinatario de los tokens temporales del login en IAM Core. */
const AUD_PASO_LOGIN = 'iam-core:paso-login';

/**
 * Lo que firma IAM Core y no es un access token:
 *  - el token temporal del login (`type`, o su `aud` propio);
 *  - el id_token (`auth_time`), que un client OIDC guarda y lleva `aud=forms`;
 *  - el logout_token del back-channel (`events`).
 * Los access tokens nunca traen esos claims.
 */
export function noEsAccessToken(payload: {
  type?: unknown;
  aud?: unknown;
}): boolean {
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  return (
    payload.type !== undefined ||
    auds.includes(AUD_PASO_LOGIN) ||
    'auth_time' in payload ||
    'events' in payload
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly rbac: RbacCacheService,
  ) {
    const iamCoreUrl = configService.get<string>(
      'IAM_CORE_URL',
      'http://localhost:4000',
    );
    const jwksUri = `${iamCoreUrl}/api/auth/.well-known/jwks.json`;
    const audiencia = configService.get<string>('IAM_CORE_JWT_AUDIENCE');

    super({
      // ── Extraer JWT desde cookie o Bearer header ────────────────
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),

      ignoreExpiration: false,

      // ── Validación RSA-256 vía JWKS de IAM Core ─────────────────
      // jwksRsa cachea la clave pública 10 min por defecto.
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600_000,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }) as any,

      algorithms: ['RS256'],
      issuer: configService.get<string>('IAM_CORE_JWT_ISSUER', 'iam-core'),
      // Con IAM_CORE_JWT_AUDIENCE=forms solo pasan los tokens emitidos para
      // forms: uno de Sync o del portal, firmado por el mismo IAM, ya no.
      // Se activa después de desplegar el IAM que pone el aud por servicio
      // (los tokens anteriores viven 15 minutos).
      ...(audiencia && { audience: audiencia }),
    });
  }

  /**
   * validate() se llama DESPUÉS de que passport-jwt verifica la firma RSA.
   * Si llega aquí, el JWT es auténtico y fue emitido por IAM Core.
   * Retornamos un objeto compatible con @CurrentUser() en los controllers.
   */
  async validate(payload: IamJwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido');
    }
    // El token temporal del login (falta el 2FA o cambiar la clave) va firmado
    // con la misma clave: sin esto, la contraseña sola daba una sesión. Lo
    // mismo el id_token y el logout_token.
    if (noEsAccessToken(payload)) {
      throw new UnauthorizedException('Termine el inicio de sesión');
    }

    // Roles del usuario EN forms (RBAC por servicio); fallback a roles globales
    // para compatibilidad con tokens/usuarios previos a la centralización.
    const formsRoles = payload.service_roles?.forms ??
      payload.roles ?? ['user'];
    // Permisos computados desde el mapa RBAC centralizado del IAM (cacheado).
    const permissions = await this.rbac.computePermissions(formsRoles);

    // Compatible con el User de Mongoose que usan los decoradores existentes.
    // _id y id apuntan al IAM Core UUID (string, no ObjectId).
    return {
      _id: payload.sub,
      id: payload.sub,
      username: payload.username,
      email: payload.email ?? null,
      fullName: null,
      roles: formsRoles,
      permissions,
      services: payload.services ?? [],
      isActive: true,
      isTwoFactorEnabled: false,
    };
  }
}
