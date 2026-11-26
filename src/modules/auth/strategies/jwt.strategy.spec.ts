import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, noEsAccessToken } from './jwt.strategy';

describe('JwtStrategy (tokens de IAM Core)', () => {
  const rbac = { computePermissions: jest.fn(() => Promise.resolve(['ver'])) };
  const crear = (extra: Record<string, string> = {}) =>
    new JwtStrategy(
      new ConfigService({ IAM_CORE_URL: 'http://iam.test', ...extra }),
      rbac as never,
    );

  it('acepta un access token y toma los roles de forms', async () => {
    const usuario = await crear().validate({
      sub: 'u-1',
      username: 'ana',
      roles: ['user'],
      services: ['forms'],
      service_roles: { forms: ['supervisor'] },
      iss: 'iam-core',
      aud: ['forms', 'iam-core'],
      exp: 0,
      iat: 0,
    });
    expect(usuario).toMatchObject({ id: 'u-1', roles: ['supervisor'] });
  });

  it.each([
    ['formato nuevo', { type: '2fa_pending', aud: 'iam-core:paso-login' }],
    ['formato viejo, sin aud', { type: '2fa_pending' }],
    ['id_token de forms', { aud: 'forms', auth_time: 1, nonce: 'n' }],
    ['logout_token', { aud: 'forms', events: {} }],
  ])('rechaza lo que no es un access token (%s)', async (_, extra) => {
    await expect(
      crear().validate({ sub: 'u-1', ...extra } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('noEsAccessToken no confunde un access token', () => {
    expect(noEsAccessToken({ aud: ['forms', 'iam-core'] })).toBe(false);
  });

  describe('aud', () => {
    // passport-jwt guarda las opciones de verificación en `_verifOpts`.
    const opciones = (e: JwtStrategy) =>
      (e as unknown as { _verifOpts: { audience?: string } })._verifOpts;

    it('sin IAM_CORE_JWT_AUDIENCE no verifica aud (como hasta ahora)', () => {
      expect(opciones(crear()).audience).toBeUndefined();
    });

    it('con IAM_CORE_JWT_AUDIENCE exige ese destinatario', () => {
      expect(opciones(crear({ IAM_CORE_JWT_AUDIENCE: 'forms' })).audience).toBe(
        'forms',
      );
    });
  });
});
