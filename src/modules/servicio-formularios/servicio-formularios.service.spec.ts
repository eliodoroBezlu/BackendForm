import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  rolesParaElServicio,
  ServicioFormulariosService,
  VIDA_DEL_TOKEN_SEGUNDOS,
} from './servicio-formularios.service';

const KID = '01K6ZQ7X8Y9ABCDEFGHJKMNPQR';
const SECRETO = 'sk_secreto-de-prueba-del-proyecto-forms';

const conEntorno = (valores: Record<string, string | undefined>) =>
  new ServicioFormulariosService(new ConfigService(valores));

interface Carga {
  sub: string;
  nombre?: string;
  roles: string[];
  iat: number;
  exp: number;
}

describe('ServicioFormulariosService', () => {
  const servicio = conEntorno({
    FORMULARIOS_KID: KID,
    FORMULARIOS_SECRETO: SECRETO,
  });
  const jwt = new JwtService();

  it('firma con HS256, el secreto del proyecto y el kid en la cabecera', () => {
    const { token } = servicio.emitirToken({
      id: 'uuid-iam-1',
      username: 'ana',
      roles: ['tecnico'],
    });

    const { header } = jwt.decode<{ header: { alg: string; kid: string } }>(
      token,
      { complete: true },
    );
    expect(header).toMatchObject({ alg: 'HS256', kid: KID });

    const carga = jwt.verify<Carga>(token, {
      secret: SECRETO,
      algorithms: ['HS256'],
    });
    expect(carga).toMatchObject({
      sub: 'uuid-iam-1',
      nombre: 'ana',
      roles: ['tecnico'],
    });
  });

  it('el token dura 15 minutos: dentro de la hora que acepta el servicio', () => {
    const { token, venceEn } = servicio.emitirToken({ id: 'u', roles: [] });
    const carga = jwt.verify<Carga>(token, { secret: SECRETO });
    expect(carga.exp - carga.iat).toBe(VIDA_DEL_TOKEN_SEGUNDOS);
    expect(carga.exp - carga.iat).toBeLessThanOrEqual(3600);
    expect(Date.parse(venceEn)).toBeGreaterThan(Date.now());
  });

  it('otro secreto no verifica el token', () => {
    const { token } = servicio.emitirToken({ id: 'u', roles: [] });
    expect(() => {
      jwt.verify<Carga>(token, { secret: 'otro' });
    }).toThrow();
  });

  it('sin nombre de usuario no manda «nombre»', () => {
    const { token } = servicio.emitirToken({
      id: 'u',
      username: null,
      roles: [],
    });
    expect(
      jwt.verify<Carga>(token, { secret: SECRETO }).nombre,
    ).toBeUndefined();
  });

  it('sin la configuración del servicio no firma nada', () => {
    expect(() =>
      conEntorno({ FORMULARIOS_KID: KID }).emitirToken({ id: 'u', roles: [] }),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      conEntorno({
        FORMULARIOS_KID: ' ',
        FORMULARIOS_SECRETO: SECRETO,
      }).emitirToken({ id: 'u', roles: [] }),
    ).toThrow(ServiceUnavailableException);
  });
});

describe('rolesParaElServicio', () => {
  it('pasa los roles de forms tal cual', () => {
    expect(rolesParaElServicio(['tecnico', 'supervisor'])).toEqual([
      'tecnico',
      'supervisor',
    ]);
  });

  it('suma admin a quien es super_admin, sin repetirlo', () => {
    expect(rolesParaElServicio(['super_admin'])).toEqual([
      'super_admin',
      'admin',
    ]);
    expect(rolesParaElServicio(['super_admin', 'admin'])).toEqual([
      'super_admin',
      'admin',
    ]);
  });
});
