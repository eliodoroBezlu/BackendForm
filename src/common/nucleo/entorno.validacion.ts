/**
 * Validación del entorno al arrancar.
 *
 * El objetivo es que la aplicación **falle en el arranque** si le falta una
 * variable imprescindible, en vez de fallar en la primera petición que la
 * necesite —que es cuando ya hay usuarios delante y el error aparece como un
 * 500 sin explicación—.
 *
 * `ConfigModule` invoca esta función con el `process.env` completo. Si lanza,
 * Nest aborta el arranque y el mensaje sale por consola.
 */

/** Variables sin las cuales la aplicación no puede funcionar. */
const OBLIGATORIAS = ['MONGODB_URI'] as const;

/**
 * Variables que no son obligatorias para arrancar, pero cuya ausencia degrada
 * el servicio de forma silenciosa. Se avisa sin abortar.
 */
const RECOMENDADAS = [
  'IAM_CORE_URL',
  'CORS_ORIGIN',
  'INSPECTOR_API_KEY',
] as const;

export function validarEntorno(
  entorno: Record<string, unknown>,
): Record<string, unknown> {
  const faltantes = OBLIGATORIAS.filter((clave) => {
    const valor = entorno[clave];
    return typeof valor !== 'string' || valor.trim() === '';
  });

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. ` +
        'Revisa el archivo .env antes de arrancar.',
    );
  }

  const ausentes = RECOMENDADAS.filter((clave) => {
    const valor = entorno[clave];
    return typeof valor !== 'string' || valor.trim() === '';
  });

  if (ausentes.length > 0) {
    // Sin Logger todavía: ConfigModule corre antes de que exista la app.
    process.stderr.write(
      `[entorno] Variables recomendadas sin definir: ${ausentes.join(', ')}\n`,
    );
  }

  return entorno;
}
