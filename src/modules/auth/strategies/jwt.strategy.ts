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
import { getPermissionsForRoles } from '../enums/role-permissions';

interface IamJwtPayload {
  sub:      string;    // IAM Core UUID
  username: string;
  email?:   string;
  roles:    string[];
  services: string[];
  iss:      string;
  aud:      string | string[];
  exp:      number;
  iat:      number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const iamCoreUrl = configService.get<string>('IAM_CORE_URL', 'http://localhost:4000');
    const jwksUri    = `${iamCoreUrl}/api/auth/.well-known/jwks.json`;

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
        cache:                  true,
        cacheMaxEntries:        5,
        cacheMaxAge:            600_000,
        rateLimit:              true,
        jwksRequestsPerMinute:  5,
        jwksUri,
      }) as any,

      algorithms: ['RS256'],
      issuer:     configService.get<string>('IAM_CORE_JWT_ISSUER', 'iam-core'),
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

    const roles       = payload.roles ?? ['user'];
    const permissions = getPermissionsForRoles(roles as any);

    // Compatible con el User de Mongoose que usan los decoradores existentes.
    // _id y id apuntan al IAM Core UUID (string, no ObjectId).
    return {
      _id:                payload.sub,
      id:                 payload.sub,
      username:           payload.username,
      email:              payload.email  ?? null,
      fullName:           null,
      roles,
      permissions,
      services:           payload.services ?? [],
      isActive:           true,
      isTwoFactorEnabled: false,
    };
  }
}
