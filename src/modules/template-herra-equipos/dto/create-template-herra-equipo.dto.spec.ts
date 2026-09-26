import { ValidationPipe } from '@nestjs/common';
import { CreateVerificationFieldDto } from './create-template-herra-equipo.dto';

/**
 * El `ValidationPipe` global corre con `whitelist: true`, que **borra en
 * silencio** cualquier propiedad que el DTO no declare. Ya nos pasó con los
 * `_id` de las actividades del PGR: el formulario mandaba el dato, el pipe lo
 * quitaba, y la corrupción solo se veía al recargar.
 *
 * Estas pruebas fijan que la configuración de un campo de tipo «Selección»
 * llega entera al servicio.
 */
describe('CreateVerificationFieldDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const validar = (entrada: Record<string, unknown>) =>
    pipe.transform(entrada, {
      type: 'body',
      metatype: CreateVerificationFieldDto,
    }) as Promise<CreateVerificationFieldDto>;

  it('conserva las opciones y permiteOtro de un campo de selección', async () => {
    const entrada = {
      label: 'TIPO VEHÍCULO',
      type: 'select',
      options: ['Camioneta', 'Camion', 'Vagoneta'],
      permiteOtro: true,
      obligatorio: true,
    };

    await expect(validar(entrada)).resolves.toEqual(entrada);
  });

  it('acepta una selección sin permiteOtro (lista cerrada)', async () => {
    const salida = await validar({
      label: 'COLOR',
      type: 'select',
      options: ['Blanco', 'Rojo'],
    });

    expect(salida.options).toEqual(['Blanco', 'Rojo']);
    expect(salida.permiteOtro).toBeUndefined();
  });

  it('sigue quitando propiedades que el DTO no declara', async () => {
    const salida = await validar({
      label: 'EMPRESA',
      type: 'text',
      inventado: 'x',
    });

    expect(salida).not.toHaveProperty('inventado');
  });

  it('rechaza permiteOtro con un valor que no es booleano', async () => {
    await expect(
      validar({ label: 'COLOR', type: 'select', permiteOtro: 'si' }),
    ).rejects.toThrow();
  });

  /**
   * `whitelist: true` descarta en silencio lo que el DTO no declara: si esta
   * propiedad no estuviera aquí, el constructor guardaría el valor por defecto
   * y el backend lo tiraría sin decir nada.
   */
  it('conserva el valor por defecto del campo', async () => {
    const salida = await validar({
      label: 'EMPRESA',
      type: 'text',
      valorPorDefecto: 'Minera San Cristóbal S.A.',
    });

    expect(salida.valorPorDefecto).toBe('Minera San Cristóbal S.A.');
  });

  it('rechaza un valor por defecto que no es texto', async () => {
    await expect(
      validar({ label: 'EMPRESA', type: 'text', valorPorDefecto: 42 }),
    ).rejects.toThrow();
  });
});
