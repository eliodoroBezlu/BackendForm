import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import { AuditoriaInterceptor } from './auditoria.interceptor';
import { AuditoriaService, AsientoAuditoria } from './auditoria.service';

/**
 * Una baja dejaba constancia de **quién y cuándo**, pero no de **qué**.
 *
 * Con el id de una inspección borrada en la mano no había forma de saber qué
 * contenía: el documento ya no existía y el asiento solo guardaba la ruta. Eso
 * pasó de verdad —la inspección `695e99621e09e076a7892999`, borrada el 25 de
 * agosto de 2026, es irrecuperable—.
 */

const contextoFalso = (
  metodo: string,
  cuerpo: Record<string, unknown> = {},
): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({
      getRequest: () => ({
        method: metodo,
        path: '/inspections-herra-equipos/insp-1',
        params: { id: 'insp-1' },
        body: cuerpo,
        ip: '127.0.0.1',
        get: () => undefined,
        user: { username: 'eliodoro', roles: ['admin'] },
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  }) as unknown as ExecutionContext;

const manejadorQueDevuelve = (valor: unknown): CallHandler => ({
  handle: () => of(valor),
});

describe('Auditoría · archivar el documento dado de baja', () => {
  let interceptor: AuditoriaInterceptor;
  let registrar: jest.Mock;

  /** Ejecuta el interceptor y devuelve el asiento que intentó escribir. */
  const asientoDe = async (
    metodo: string,
    respuesta: unknown,
    cuerpo: Record<string, unknown> = {},
  ): Promise<AsientoAuditoria> => {
    await lastValueFrom(
      interceptor.intercept(
        contextoFalso(metodo, cuerpo),
        manejadorQueDevuelve(respuesta),
      ),
    );
    // `registrar` se lanza sin esperarla dentro del `tap`; una vuelta por la
    // cola de microtareas basta para que haya corrido.
    await Promise.resolve();
    return registrar.mock.calls[0][0] as AsientoAuditoria;
  };

  beforeEach(() => {
    registrar = jest.fn().mockResolvedValue(undefined);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    interceptor = new AuditoriaInterceptor(
      { registrar } as unknown as AuditoriaService,
      reflector,
    );
  });

  it('guarda el documento que venía en `data`', async () => {
    const asiento = await asientoDe('DELETE', {
      success: true,
      message: 'Inspección dada de baja',
      data: { _id: 'insp-1', templateCode: '3.04.P37.F24', activo: false },
    });

    expect(asiento.documento).toMatchObject({
      _id: 'insp-1',
      templateCode: '3.04.P37.F24',
    });
  });

  it('no guarda las llaves de la respuesta, que no son del documento', async () => {
    const asiento = await asientoDe('DELETE', {
      success: true,
      message: 'Inspección dada de baja',
      data: { _id: 'insp-1' },
    });

    expect(asiento.documento).not.toHaveProperty('success');
    expect(asiento.documento).not.toHaveProperty('message');
  });

  it('acepta un documento de Mongoose, usando su `toJSON`', async () => {
    const asiento = await asientoDe('DELETE', {
      data: {
        $__: { maquinaria: 'interna de mongoose' },
        toJSON: () => ({ _id: 'insp-1', templateCode: 'X' }),
      },
    });

    expect(asiento.documento).toEqual({ _id: 'insp-1', templateCode: 'X' });
    expect(asiento.documento).not.toHaveProperty('$__');
  });

  it('recorta las firmas en base64 en vez de meterlas en la bitácora', async () => {
    const firma = `data:image/png;base64,${'A'.repeat(4000)}`;
    const asiento = await asientoDe('DELETE', {
      data: { _id: 'insp-1', firmaInspector: firma },
    });

    const guardada = (asiento.documento as Record<string, unknown>)
      .firmaInspector as string;
    expect(guardada).toMatch(/^\[omitido:/);
    expect(guardada.length).toBeLessThan(100);
  });

  it('no archiva nada cuando el DELETE solo devuelve un mensaje', async () => {
    // Es el caso de los módulos que aún no devuelven el documento: no se
    // inventa nada, simplemente no hay copia.
    const asiento = await asientoDe('DELETE', {
      success: true,
      message: 'Eliminado exitosamente',
    });

    expect(asiento.documento).toBeUndefined();
  });

  it('no archiva en métodos que no son DELETE', async () => {
    // Un POST o un PATCH ya guardan el cuerpo en `datos`; duplicarlo aquí solo
    // engordaría la bitácora.
    const asiento = await asientoDe(
      'POST',
      { data: { _id: 'insp-1', templateCode: 'X' } },
      { templateCode: 'X', verification: { TAG: 'T-1' } },
    );

    expect(asiento.documento).toBeUndefined();
    expect(asiento.datos).toMatchObject({ templateCode: 'X' });
  });
});
