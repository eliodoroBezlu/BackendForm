/**
 * IamProxyService
 * ─────────────────────────────────────────────────────────────────
 * Proxy transparente entre BackendForm y IAM Core.
 * Todas las llamadas de auth se delegan aquí.
 * Las cookies (access_token, refresh_token) son reenviadas 1:1 al cliente.
 */
import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Injectable()
export class IamProxyService {
  private readonly logger = new Logger(IamProxyService.name);
  private readonly iamUrl:  string;
  private readonly apiKey:  string;

  constructor(private readonly config: ConfigService) {
    this.iamUrl = this.config.get<string>('IAM_CORE_URL', 'http://localhost:4000');
    this.apiKey  = this.config.get<string>('IAM_CORE_API_KEY', '');
  }

  // ── Cabeceras comunes ─────────────────────────────────────────
  private baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    return headers;
  }

  // ── POST genérico ──────────────────────────────────────────────

  async post(
    path:    string,
    body:    Record<string, unknown>,
    cookies: Record<string, string> = {},
  ): Promise<{ data: unknown; rawHeaders: string[] }> {
    const url = `${this.iamUrl}/api${path}`;

    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const res = await fetch(url, {
      method:  'POST',
      headers: this.baseHeaders({
        'Content-Type': 'application/json',
        ...(cookieHeader && { Cookie: cookieHeader }),
      }),
      body: JSON.stringify(body),
    });

    const rawHeaders = res.headers.getSetCookie?.() ?? [];
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));

    if (!res.ok) {
      this.logger.warn(`IAM Core ${path} → ${res.status}: ${JSON.stringify(data)}`);
      throw new HttpException(
        (data as { message?: string }).message ?? res.statusText,
        res.status,
      );
    }

    return { data, rawHeaders };
  }

  // ── GET genérico ───────────────────────────────────────────────

  async get(
    path:    string,
    cookies: Record<string, string> = {},
  ): Promise<unknown> {
    const url = `${this.iamUrl}/api${path}`;

    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const res = await fetch(url, {
      headers: this.baseHeaders({
        ...(cookieHeader && { Cookie: cookieHeader }),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new HttpException(
        (data as { message?: string }).message ?? res.statusText,
        res.status,
      );
    }

    return data;
  }

  // ── Reenviar Set-Cookie de IAM Core al browser ─────────────────
  // IAM Core ya setea httpOnly + SameSite en sus cookies.
  // Aquí las reenviamos 1:1 sin modificar los atributos.

  forwardCookies(rawHeaders: string[], res: Response): void {
    if (!rawHeaders.length) return;

    // Express permite múltiples Set-Cookie con append manual
    for (const raw of rawHeaders) {
      res.append('Set-Cookie', raw);
    }
  }

  // ── Limpiar cookies en el browser ─────────────────────────────
  // El domain debe coincidir con el usado al setear (COOKIE_DOMAIN) para
  // que el borrado aplique en escenarios de SSO cross-subdominio.

  clearCookies(res: Response): void {
    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;
    res.clearCookie('access_token',  { path: '/', domain });
    res.clearCookie('refresh_token', { path: '/', domain });
  }
}
