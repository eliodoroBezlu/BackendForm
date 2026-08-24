/**
 * Deja el cuerpo de una petición en algo que se pueda guardar sin peligro.
 *
 * Dos riesgos distintos, y los dos reales en este proyecto:
 *
 * 1. **Secretos.** `/auth/login` lleva la contraseña en el cuerpo. Guardarla
 *    tal cual la deja escrita en claro en una colección que se consulta a mano.
 * 2. **Tamaño.** Las firmas viajan como data URL en base64 y una inspección
 *    lleva varias; sin recortar, cada envío mete megabytes en la auditoría.
 */

/**
 * Nombres de campo cuyo valor nunca se guarda. Se comparan en minúsculas y por
 * inclusión, así que `refreshToken` cae por `token`.
 */
const CLAVES_SECRETAS = [
  'password',
  'contrasena',
  'contraseña',
  'token',
  'secret',
  'authorization',
  'cookie',
  'codigo2fa',
  'twofactor',
  'otp',
  'apikey',
];

/** A partir de aquí un texto se considera un adjunto, no un dato. */
const LARGO_MAXIMO_TEXTO = 512;

/** Tope del asiento entero, por si alguien manda un array de mil elementos. */
const LARGO_MAXIMO_ASIENTO = 20_000;

/** Profundidad máxima; evita que una estructura circular o muy anidada cuelgue. */
const PROFUNDIDAD_MAXIMA = 6;

const esSecreta = (clave: string): boolean => {
  const k = clave.toLowerCase();
  return CLAVES_SECRETAS.some((s) => k.includes(s));
};

const pesoAproximado = (texto: string): string => {
  const kb = Math.round((texto.length * 3) / 4 / 1024); // base64 → bytes
  return kb > 0 ? `${kb} KB` : `${texto.length} caracteres`;
};

const sanearValor = (valor: unknown, profundidad: number): unknown => {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') {
    return valor.length > LARGO_MAXIMO_TEXTO
      ? `[omitido: ${pesoAproximado(valor)}]`
      : valor;
  }

  if (typeof valor !== 'object') return valor;

  if (profundidad >= PROFUNDIDAD_MAXIMA) return '[demasiado anidado]';

  if (valor instanceof Date) return valor.toISOString();

  if (Array.isArray(valor)) {
    // Un array largo no aporta más que su tamaño y una muestra.
    if (valor.length > 20) {
      return [
        ...valor.slice(0, 20).map((v) => sanearValor(v, profundidad + 1)),
        `[y ${valor.length - 20} más]`,
      ];
    }
    return valor.map((v) => sanearValor(v, profundidad + 1));
  }

  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = esSecreta(clave)
      ? '[redactado]'
      : sanearValor(v, profundidad + 1);
  }
  return salida;
};

/**
 * Devuelve el cuerpo listo para guardar, o `undefined` si no hay nada que
 * merezca la pena.
 */
export function sanearCuerpo(
  cuerpo: unknown,
): Record<string, unknown> | undefined {
  if (!cuerpo || typeof cuerpo !== 'object') return undefined;
  if (Array.isArray(cuerpo)) return { items: sanearValor(cuerpo, 0) };
  if (Object.keys(cuerpo).length === 0) return undefined;

  const saneado = sanearValor(cuerpo, 0) as Record<string, unknown>;

  const serializado = JSON.stringify(saneado);
  if (serializado.length > LARGO_MAXIMO_ASIENTO) {
    return {
      _truncado: `El cuerpo ocupaba ${Math.round(serializado.length / 1024)} KB y no se guardó entero.`,
      _claves: Object.keys(saneado),
    };
  }

  return saneado;
}
