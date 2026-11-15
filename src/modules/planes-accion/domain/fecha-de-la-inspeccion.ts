const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** `AAAA-MM-DD` del día en Bolivia, o `undefined` si no es una fecha. */
function diaEnBolivia(valor: unknown): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    return valor.trim();
  }
  const fecha = new Date(valor as string | number | Date);
  if (Number.isNaN(fecha.getTime())) return undefined;
  // `en-CA` escribe AAAA-MM-DD.
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}

/**
 * El día en que se hizo la IRO o ISOP, como `AAAA-MM-DD`, para que el plan diga
 * de qué inspección sale.
 *
 * Sale del dato «Fecha inspección» de la inspección, cuyo nombre cambia de una
 * plantilla a otra («Fecha Inspección», «Fecha inspección (yyyy-mm-aa)»…). Si
 * no está o no es una fecha, se usa el día en que se registró la inspección.
 *
 * Se devuelve el día y no un instante: el formulario guarda la medianoche de
 * Bolivia, y convertirlo a fecha en otra zona horaria podía mostrar el día
 * anterior.
 */
export function fechaDeLaInspeccion(
  datos: Record<string, unknown> | Map<string, unknown> | undefined,
  registradaEl?: Date | string,
): string | undefined {
  const entradas =
    datos instanceof Map ? [...datos.entries()] : Object.entries(datos ?? {});
  const campo = entradas.find(([clave]) => {
    const c = normalizar(clave);
    return c.includes('fecha') && c.includes('inspec');
  });
  return diaEnBolivia(campo?.[1]) ?? diaEnBolivia(registradaEl);
}
