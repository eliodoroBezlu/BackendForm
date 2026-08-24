import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { IamProxyService } from './iam-proxy.service';
import { ES_PUBLICO } from '../../common/nucleo/publico.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';

/**
 * Este controlador es un proxy fino hacia IAM Core, así que lo que de verdad
 * hay que fijar no es su lógica sino **su superficie de seguridad**: qué rutas
 * son anónimas y cuáles no.
 *
 * Desde que el guard de autenticación es global, abrir una ruta es un acto
 * explícito (`@Publico()`). Estas pruebas leen esos metadatos: si alguien abre
 * o cierra un endpoint sin querer, falla aquí y no en producción.
 */

const respuestaFalsa = () =>
  ({ setHeader: jest.fn(), cookie: jest.fn() }) as unknown as Response;

describe('AuthController', () => {
  let controller: AuthController;
  let reflector: Reflector;
  let iam: { post: jest.Mock; get: jest.Mock; forwardCookies: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    iam = {
      post: jest.fn().mockResolvedValue({ data: { ok: true }, rawHeaders: [] }),
      get: jest.fn().mockResolvedValue({}),
      forwardCookies: jest.fn(),
    };
    config = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IamProxyService, useValue: iam },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    reflector = new Reflector();
  });

  const esPublica = (metodo: keyof AuthController) =>
    reflector.get<boolean>(ES_PUBLICO, controller[metodo] as never) === true;

  describe('superficie publica', () => {
    it.each(['login', 'verify2FA', 'refresh', 'logout'] as const)(
      '%s es anonima',
      (metodo) => {
        // Son las rutas que se usan ANTES de tener un token valido, o para
        // deshacerse de el. Cerrarlas dejaria a los usuarios fuera.
        expect(esPublica(metodo as keyof AuthController)).toBe(true);
      },
    );

    it('el login de inspector es anonimo pero valida su propia API Key', () => {
      expect(esPublica('inspectorLogin')).toBe(true);
    });

    it.each(['me', 'setup2FA', 'enable2FA', 'disable2FA'] as const)(
      '%s NO es anonima',
      (metodo) => {
        expect(esPublica(metodo as keyof AuthController)).toBe(false);
      },
    );
  });

  describe('alta de usuarios', () => {
    it('NO es anonima', () => {
      // El proxy no reenvia la identidad de quien llama a IAM Core —solo la
      // clave del servicio—, asi que la comprobacion tiene que ocurrir aqui.
      expect(esPublica('register')).toBe(false);
    });

    it('exige rol de administrador', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.register as never,
      );

      expect(roles).toContain(Role.ADMIN);
      expect(roles).toContain(Role.SUPER_ADMIN);
    });
  });

  describe('login', () => {
    it('reenvia a IAM solo el usuario y la contraseña', async () => {
      await controller.login(
        {
          username: 'jperez',
          password: 'secreto',
          rolQueQuiero: 'admin',
        } as never,
        respuestaFalsa(),
      );

      // Si se reenviara el cuerpo entero, el cliente podria colar campos que
      // IAM interprete (roles, banderas...).
      expect(iam.post).toHaveBeenCalledWith('/auth/login', {
        username: 'jperez',
        password: 'secreto',
      });
    });

    it('reenvia al navegador las cookies que emite IAM', async () => {
      const res = respuestaFalsa();
      iam.post.mockResolvedValue({
        data: { ok: true },
        rawHeaders: ['access_token=abc; HttpOnly'],
      });

      await controller.login({ username: 'a', password: 'b' }, res);

      // Sin esto el usuario recibe un 200 y se queda sin sesion.
      expect(iam.forwardCookies).toHaveBeenCalledWith(
        ['access_token=abc; HttpOnly'],
        res,
      );
    });
  });

  describe('inspectorLogin', () => {
    it('sin INSPECTOR_API_KEY configurada, rechaza', async () => {
      config.get.mockReturnValue(undefined);

      await expect(
        controller.inspectorLogin({ inspectorKey: 'x' }, respuestaFalsa()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('con una clave que no coincide, rechaza sin llamar a IAM', async () => {
      config.get.mockReturnValue('clave-real');

      await expect(
        controller.inspectorLogin(
          { inspectorKey: 'clave-falsa' },
          respuestaFalsa(),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Importante: la clave se comprueba ANTES de gastar una llamada a IAM.
      expect(iam.post).not.toHaveBeenCalled();
    });
  });
});
