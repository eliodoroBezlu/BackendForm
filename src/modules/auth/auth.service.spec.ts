import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { Session } from './schemas/session.schema';
import { Role } from './enums/role.enum';

/**
 * Comprueba las reglas de autenticación con los modelos de Mongoose
 * simulados. No hay base de datos: lo que se verifica son las decisiones del
 * servicio —a quién deja pasar, a quién no y qué guarda—, que es donde un
 * error se paga caro.
 */

interface ModeloSimulado {
  findOne: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  countDocuments: jest.Mock;
  deleteMany: jest.Mock;
}

const modeloVacio = (): ModeloSimulado => ({
  findOne: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
});

/** Usuario con lo mínimo que mira el servicio. */
const usuario = (extra: Partial<Record<string, unknown>> = {}) =>
  ({
    _id: { toString: () => 'id-usuario' },
    username: 'jperez',
    password: '',
    roles: [Role.USER],
    isActive: true,
    isTwoFactorEnabled: false,
    backupCodes: [],
    save: jest.fn(),
    ...extra,
  }) as unknown as User;

describe('AuthService', () => {
  let service: AuthService;
  let modeloUsuario: ModeloSimulado;
  let modeloSesion: ModeloSimulado;
  let jwt: { sign: jest.Mock; verify: jest.Mock; signAsync: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    modeloUsuario = modeloVacio();
    modeloSesion = modeloVacio();
    jwt = {
      sign: jest.fn().mockReturnValue('token-firmado'),
      verify: jest.fn(),
      signAsync: jest.fn().mockResolvedValue('token-firmado'),
    };
    config = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: modeloUsuario },
        { provide: getModelToken(Session.name), useValue: modeloSesion },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('rechaza un username que ya existe', async () => {
      modeloUsuario.findOne.mockResolvedValueOnce(usuario());

      await expect(
        service.register({ username: 'jperez', password: 'x' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un email que ya existe', async () => {
      modeloUsuario.findOne
        .mockResolvedValueOnce(null) // username libre
        .mockResolvedValueOnce(usuario()); // email ocupado

      await expect(
        service.register({
          username: 'nuevo',
          email: 'a@b.com',
          password: 'x',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('NUNCA guarda la contraseña en claro', async () => {
      modeloUsuario.create.mockResolvedValue(usuario());

      await service.register({
        username: 'nuevo',
        password: 'secreto123',
      } as never);

      const guardado = modeloUsuario.create.mock.calls[0][0] as {
        password: string;
      };
      expect(guardado.password).not.toBe('secreto123');
      // Y el hash tiene que ser verificable, no una cadena cualquiera.
      await expect(
        bcrypt.compare('secreto123', guardado.password),
      ).resolves.toBe(true);
    });

    it('sin roles indicados, el usuario nace con el rol basico', async () => {
      modeloUsuario.create.mockResolvedValue(usuario());

      await service.register({ username: 'nuevo', password: 'x' } as never);

      const guardado = modeloUsuario.create.mock.calls[0][0] as {
        roles: string[];
      };
      expect(guardado.roles).toEqual([Role.USER]);
    });

    it('la respuesta no devuelve la contraseña', async () => {
      modeloUsuario.create.mockResolvedValue(usuario());

      const respuesta = await service.register({
        username: 'nuevo',
        password: 'x',
      } as never);

      expect(respuesta).not.toHaveProperty('password');
      expect(Object.keys(respuesta)).toEqual([
        'id',
        'username',
        'email',
        'roles',
      ]);
    });
  });

  describe('validateUser', () => {
    it('un usuario inexistente no valida', async () => {
      await expect(service.validateUser('fantasma', 'x')).resolves.toBeNull();
    });

    it('un usuario DESACTIVADO no entra ni con la contraseña correcta', async () => {
      const clave = await bcrypt.hash('correcta', 4);
      modeloUsuario.findOne.mockResolvedValue(
        usuario({ password: clave, isActive: false }),
      );

      await expect(
        service.validateUser('jperez', 'correcta'),
      ).resolves.toBeNull();
    });

    it('una contraseña incorrecta no valida', async () => {
      const clave = await bcrypt.hash('correcta', 4);
      modeloUsuario.findOne.mockResolvedValue(usuario({ password: clave }));

      await expect(
        service.validateUser('jperez', 'incorrecta'),
      ).resolves.toBeNull();
    });

    it('con usuario activo y contraseña correcta, devuelve el usuario', async () => {
      const clave = await bcrypt.hash('correcta', 4);
      modeloUsuario.findOne.mockResolvedValue(usuario({ password: clave }));

      const validado = await service.validateUser('jperez', 'correcta');
      expect(validado).not.toBeNull();
      expect(validado?.username).toBe('jperez');
    });
  });

  describe('login con 2FA', () => {
    it('con 2FA activo NO entrega tokens de sesion, solo el temporal', async () => {
      const respuesta = await service.login(
        usuario({ isTwoFactorEnabled: true }),
        'agente',
        '127.0.0.1',
      );

      expect(respuesta).toMatchObject({ requires2FA: true });
      expect(respuesta).toHaveProperty('tempToken');
      // Lo importante: sin el segundo factor no hay acceso.
      expect(respuesta).not.toHaveProperty('accessToken');
      expect(respuesta).not.toHaveProperty('refreshToken');
    });

    it('el token temporal se firma con un secreto DISTINTO al de acceso', async () => {
      await service.login(
        usuario({ isTwoFactorEnabled: true }),
        'agente',
        '127.0.0.1',
      );

      // Si compartiera secreto con el token de acceso, el temporal serviria
      // para entrar sin completar el segundo factor.
      expect(config.get).toHaveBeenCalledWith('JWT_TEMP_SECRET');
    });
  });

  describe('verify2FA', () => {
    it('un token temporal invalido no pasa', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('expirado');
      });

      await expect(
        service.verify2FA('token-malo', '123456', 'agente', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un usuario sin 2FA activo no puede verificar', async () => {
      jwt.verify.mockReturnValue({ sub: 'id-usuario' });
      modeloUsuario.findById.mockResolvedValue(
        usuario({ isTwoFactorEnabled: false }),
      );

      await expect(
        service.verify2FA('token', '123456', 'agente', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('un codigo erroneo sin codigo de respaldo valido se rechaza', async () => {
      jwt.verify.mockReturnValue({ sub: 'id-usuario' });
      modeloUsuario.findById.mockResolvedValue(
        usuario({
          isTwoFactorEnabled: true,
          twoFactorSecret: 'JBSWY3DPEHPK3PXP',
          backupCodes: [],
        }),
      );

      await expect(
        service.verify2FA('token', '000000', 'agente', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('loginInspector', () => {
    it('sin INSPECTOR_API_KEY configurada, nadie entra', async () => {
      config.get.mockReturnValue(undefined);

      await expect(
        service.loginInspector('la-que-sea', undefined, 'agente', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('una API Key que no coincide se rechaza', async () => {
      config.get.mockReturnValue('clave-correcta');

      await expect(
        service.loginInspector('clave-falsa', undefined, 'agente', '1.2.3.4'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('borra las sesiones caducadas, las revocadas viejas y las abandonadas', async () => {
      modeloSesion.deleteMany.mockResolvedValue({ deletedCount: 7 });

      const borradas = await service.cleanupExpiredSessions();

      expect(borradas).toBe(7);
      const filtro = modeloSesion.deleteMany.mock.calls[0][0] as {
        $or: unknown[];
      };
      // Las tres condiciones tienen que seguir ahi: si alguien quita una, la
      // coleccion de sesiones crece sin limite.
      expect(filtro.$or).toHaveLength(3);
    });

    it('no borra sesiones activas y recientes', async () => {
      await service.cleanupExpiredSessions();

      const filtro = JSON.stringify(
        modeloSesion.deleteMany.mock.calls[0][0] as unknown,
      );
      // Toda condicion de borrado va contra una fecha pasada o contra
      // isRevoked; ninguna borra por estar simplemente activa.
      expect(filtro).toContain('expiresAt');
      expect(filtro).toContain('isRevoked');
    });
  });
});
