/**
 * AuthController — BackendForm integrado con IAM Core
 * ─────────────────────────────────────────────────────
 * Todos los endpoints de auth proxean a IAM Core.
 * Las cookies (access_token, refresh_token) se reenvían 1:1 al browser.
 * FormNext no necesita saber que existe IAM Core.
 */
import {
  Controller, Post, Get, Body, Req, Res,
  HttpCode, HttpStatus, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService }   from '@nestjs/config';
import { Response } from 'express';
import { JwtAuthGuard }    from './guards/jwt-auth.guard';
import { CurrentUser }     from 'src/common/decorators/current-user.decorator';
import { IamProxyService } from './iam-proxy.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly iam:    IamProxyService,
    private readonly config: ConfigService,
  ) {}

  // ── Login ─────────────────────────────────────────────────────
  // FormNext llama a POST /auth/login con { username, password }
  // Proxea a IAM Core, reenvía Set-Cookie al browser.

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, rawHeaders } = await this.iam.post('/auth/login', {
      username: body.username,
      password: body.password,
    });

    this.iam.forwardCookies(rawHeaders, res);
    return data;
  }

  // ── Verificar 2FA ─────────────────────────────────────────────
  // FormNext llama a POST /auth/verify-2fa con { tempToken, code }
  // IAM Core tiene el endpoint en /auth/login/2fa

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2FA(
    @Body() body: { tempToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, rawHeaders } = await this.iam.post('/auth/login/2fa', {
      tempToken: body.tempToken,
      code:      body.code,
    });

    this.iam.forwardCookies(rawHeaders, res);
    return data;
  }

  // ── Refresh ───────────────────────────────────────────────────
  // Middleware de FormNext llama a POST /auth/refresh con cookie refresh_token

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req()  req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException('Sin refresh token');

    const { data, rawHeaders } = await this.iam.post(
      '/auth/refresh',
      {},
      { refresh_token: refreshToken },
    );

    this.iam.forwardCookies(rawHeaders, res);
    return data;
  }

  // ── Logout ────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accessToken  = req.cookies?.access_token;
    const refreshToken = req.cookies?.refresh_token;

    if (accessToken || refreshToken) {
      await this.iam.post('/auth/logout', {}, {
        ...(accessToken  && { access_token:  accessToken }),
        ...(refreshToken && { refresh_token: refreshToken }),
      }).catch(() => {/* ignorar error — siempre limpiar cookies */});
    }

    this.iam.clearCookies(res);
    return { message: 'Sesión cerrada' };
  }

  // ── Me ────────────────────────────────────────────────────────
  // Devuelve el perfil del usuario autenticado desde IAM Core.

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @Req()         req: any,
    @CurrentUser() user: any,
  ) {
    const accessToken = req.cookies?.access_token;
    if (!accessToken) throw new UnauthorizedException('Sin token');

    // Llamar a IAM Core para datos frescos (fullName, lastLoginAt, servicios, etc.)
    const iamUser = await this.iam.get('/auth/me', {
      access_token: accessToken,
    }).catch(() => null);

    // Si IAM Core falla, retornar lo que tenemos del JWT payload
    if (!iamUser) {
      return {
        id:                 user.id,
        username:           user.username,
        email:              user.email,
        fullName:           user.fullName,
        roles:              user.roles,
        permissions:        user.permissions,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      };
    }

    return iamUser;
  }

  // ── TOTP / 2FA setup ─────────────────────────────────────────
  // Proxea al nuevo path de IAM Core (/auth/totp/*)

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2FA(@Req() req: any) {
    const accessToken = req.cookies?.access_token;
    return this.iam.post('/auth/totp/setup', {}, { access_token: accessToken });
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2FA(
    @Req()  req: any,
    @Body() body: { code: string },
  ) {
    const accessToken = req.cookies?.access_token;
    const { data } = await this.iam.post(
      '/auth/totp/enable',
      { code: body.code },
      { access_token: accessToken },
    );
    return data;
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(
    @Req()  req: any,
    @Body() body: { code: string },
  ) {
    const accessToken = req.cookies?.access_token;
    const { data } = await this.iam.post(
      '/auth/totp/disable',
      { code: body.code },
      { access_token: accessToken },
    );
    return data;
  }

  // ── Register ─────────────────────────────────────────────────
  // En IAM Core el registro es admin-only. Se proxy igualmente.

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: Record<string, unknown>) {
    const { data } = await this.iam.post('/auth/register', body);
    return data;
  }

  // ── Inspector login (legacy — acceso temporal de técnico) ─────────
  // Acceso directo de inspector mientras se migran todos los trabajadores
  // a usuarios IAM Core con passkey. Se eliminará gradualmente.
  //
  // Flujo:
  //  1. FormNext envía { inspectorKey } (gate de acceso legacy)
  //  2. Se valida contra INSPECTOR_API_KEY
  //  3. Login server-to-server contra IAM Core con el usuario inspector dedicado
  //  4. Se reenvían las cookies (access_token, refresh_token) al browser

  @Post('inspector')
  @HttpCode(HttpStatus.OK)
  async inspectorLogin(
    @Body() body: { inspectorKey?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // 1. Validar la API Key del inspector
    const validKey = this.config.get<string>('INSPECTOR_API_KEY');
    if (!validKey || body.inspectorKey !== validKey) {
      throw new UnauthorizedException('API Key de inspector inválida');
    }

    // 2. Usuario inspector dedicado en IAM Core
    const username = this.config.get<string>('INSPECTOR_USERNAME', 'inspector_tecnico');

    // 3. Service-login contra IAM Core: sin contraseña, la confianza está
    //    en la X-Api-Key que añade IamProxyService. Evita el problema de
    //    sincronizar contraseñas entre servicios.
    const { data, rawHeaders } = await this.iam.post('/auth/service-login', {
      username,
    });

    // 4. Reenviar cookies al browser
    this.iam.forwardCookies(rawHeaders, res);
    return data;
  }
}
