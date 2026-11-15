import { ordenarComoLaPlantilla } from './escaleras-orden';

const mapeo = {
  'SIMPLE DE UN TRAMO': { startRow: 25 },
  TIJERA: { startRow: 27 },
  EXTENSIBLE: { startRow: 32 },
  'PLATAFORMA MOVIBLE': { startRow: 36 },
};

describe('ordenarComoLaPlantilla', () => {
  it('ordena por la fila del Excel, no por el orden del clic', () => {
    expect(
      ordenarComoLaPlantilla(
        [
          'VERIFICACIÓN ESCALERA TIPO PLATAFORMA MOVIBLE',
          '2. VERIFICACIÓN ESCALERA DOBLE O DE TIJERA',
        ],
        mapeo,
      ),
    ).toEqual([
      '2. VERIFICACIÓN ESCALERA DOBLE O DE TIJERA',
      'VERIFICACIÓN ESCALERA TIPO PLATAFORMA MOVIBLE',
    ]);
  });

  it('un solo tipo queda igual y no muta la entrada', () => {
    const entrada = [' VERIFICACIÓN ESCALERA EXTENSIBLE O TELESCÓPICA'];
    expect(ordenarComoLaPlantilla(entrada, mapeo)).toEqual(entrada);
    expect(ordenarComoLaPlantilla(entrada, mapeo)).not.toBe(entrada);
  });

  it('lo que no reconoce va al final', () => {
    expect(
      ordenarComoLaPlantilla(
        ['OTRA COSA', '1. ESCALERA SIMPLE DE UN TRAMO'],
        mapeo,
      ),
    ).toEqual(['1. ESCALERA SIMPLE DE UN TRAMO', 'OTRA COSA']);
  });
});
