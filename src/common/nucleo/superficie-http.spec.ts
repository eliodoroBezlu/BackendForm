import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ES_PUBLICO } from './publico.decorator';

/**
 * Invariantes que valen para **todos** los controladores a la vez.
 *
 * Un spec por módulo comprueba lo suyo; este cubre lo que ningún módulo mira:
 * que un controlador nuevo no nazca abierto por descuido, y que nadie deje una
 * ruta literal por debajo de una `:id` —donde queda inalcanzable—.
 *
 * Se descubren los controladores recorriendo `src/modules`, así que **un módulo
 * añadido mañana entra solo**: no hay lista que mantener.
 */

const RAICES = [
  join(__dirname, '..', '..', 'modules'),
  join(__dirname, '..'), // common/: aquí vive SaludController
];

/** Rutas anónimas legítimas, con el motivo por el que lo son. */
const PUBLICAS_ESPERADAS: Record<string, string> = {
  'AuthController.login': 'se usa antes de tener token',
  'AuthController.verify2FA': 'segundo paso del login',
  'AuthController.refresh': 'renueva un token caducado',
  'AuthController.logout': 'cerrar sesión no debe requerir sesión válida',
  'AuthController.inspectorLogin': 'valida su propia API Key',
  'ConfigBienvenidaController.obtener':
    'la pantalla de bienvenida se dibuja mientras se valida la sesión, así que se lee sin token; solo devuelve decoración',
  'SaludController.vivo': 'sonda de liveness',
  'SaludController.listo': 'sonda de readiness',
};

const buscarControladores = (dir: string): string[] => {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...buscarControladores(ruta));
    } else if (
      entrada.endsWith('.controller.ts') &&
      !entrada.endsWith('.spec.ts')
    ) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
};

interface Manejador {
  clase: string;
  metodo: string;
  ruta: string;
  metodoHttp: RequestMethod;
  esPublico: boolean;
}

const cargarManejadores = (): Manejador[] => {
  const manejadores: Manejador[] = [];

  const archivos = RAICES.flatMap((raiz) => buscarControladores(raiz));

  for (const archivo of archivos) {
    const modulo = require(archivo) as Record<string, unknown>;

    for (const [nombreClase, exportado] of Object.entries(modulo)) {
      if (
        typeof exportado !== 'function' ||
        !nombreClase.endsWith('Controller')
      )
        continue;

      const prototipo = (exportado as { prototype: object }).prototype;

      for (const nombreMetodo of Object.getOwnPropertyNames(prototipo)) {
        if (nombreMetodo === 'constructor') continue;

        const manejador = (prototipo as Record<string, unknown>)[nombreMetodo];
        if (typeof manejador !== 'function') continue;

        const ruta = Reflect.getMetadata(PATH_METADATA, manejador) as string;
        const metodoHttp = Reflect.getMetadata(METHOD_METADATA, manejador) as
          | RequestMethod
          | undefined;
        if (typeof ruta !== 'string' || metodoHttp === undefined) continue;

        manejadores.push({
          clase: nombreClase,
          metodo: nombreMetodo,
          ruta,
          metodoHttp,
          esPublico:
            Reflect.getMetadata(ES_PUBLICO, manejador) === true ||
            Reflect.getMetadata(ES_PUBLICO, exportado) === true,
        });
      }
    }
  }

  return manejadores;
};

describe('superficie HTTP de toda la aplicación', () => {
  const manejadores = cargarManejadores();

  it('se descubrieron controladores (si no, el resto no probaria nada)', () => {
    // Sin esta comprobacion, un fallo al recorrer carpetas dejaria el resto de
    // las pruebas en verde sin haber mirado nada.
    expect(manejadores.length).toBeGreaterThan(50);
  });

  it('ninguna ruta es publica salvo las que deben serlo', () => {
    const publicas = manejadores
      .filter((m) => m.esPublico)
      .map((m) => `${m.clase}.${m.metodo}`);

    const inesperadas = publicas.filter((p) => !(p in PUBLICAS_ESPERADAS));

    // Si esto falla, alguien abrió un endpoint. Si fue a propósito, añádelo a
    // PUBLICAS_ESPERADAS con el motivo; que quede escrito es justo el punto.
    expect(inesperadas).toEqual([]);
  });

  it('todas las rutas anonimas previstas siguen siendolas', () => {
    // El sentido inverso: cerrar el login por accidente deja fuera a todos.
    const publicas = new Set(
      manejadores
        .filter((m) => m.esPublico)
        .map((m) => `${m.clase}.${m.metodo}`),
    );

    const cerradasPorError = Object.keys(PUBLICAS_ESPERADAS).filter(
      (esperada) => !publicas.has(esperada),
    );

    expect(cerradasPorError).toEqual([]);
  });

  describe('orden de las rutas dentro de cada controlador', () => {
    /**
     * Una ruta «atrapatodo» es la de un solo segmento que empieza por `:`
     * —`:id`, `:tag`—. Solo ensombrece a rutas **del mismo método HTTP** y
     * **de un solo segmento**: Express no hace coincidir `/:id` con
     * `template/ABC`, que tiene dos.
     */
    const esAtrapatodo = (ruta: string) =>
      ruta.startsWith(':') && !ruta.includes('/');

    const esLiteralDeUnSegmento = (ruta: string) =>
      ruta !== '' &&
      ruta !== '/' &&
      !ruta.startsWith(':') &&
      !ruta.includes('/');

    it('ninguna ruta literal queda ensombrecida por una «:id» anterior', () => {
      const inalcanzables: string[] = [];

      const porClaseYMetodo = manejadores.reduce<Record<string, Manejador[]>>(
        (acc, m) => {
          (acc[`${m.clase}#${m.metodoHttp}`] ??= []).push(m);
          return acc;
        },
        {},
      );

      for (const [clave, rutas] of Object.entries(porClaseYMetodo)) {
        const posicion = rutas.findIndex((r) => esAtrapatodo(r.ruta));
        if (posicion === -1) continue;

        rutas.slice(posicion + 1).forEach((r) => {
          if (esLiteralDeUnSegmento(r.ruta)) {
            inalcanzables.push(`${clave} ${r.metodo} -> "${r.ruta}"`);
          }
        });
      }

      expect(inalcanzables).toEqual([]);
    });
  });
});
