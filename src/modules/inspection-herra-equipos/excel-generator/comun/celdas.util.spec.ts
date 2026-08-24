import { coordenadasDeCelda } from './celdas.util';

describe('coordenadasDeCelda', () => {
  it('traduce una referencia normal', () => {
    expect(coordenadasDeCelda('A1')).toEqual({ row: 1, col: 1 });
    expect(coordenadasDeCelda('B12')).toEqual({ row: 12, col: 2 });
    expect(coordenadasDeCelda('Z5')).toEqual({ row: 5, col: 26 });
  });

  it('cuenta las columnas de dos letras en base 26', () => {
    expect(coordenadasDeCelda('AA1').col).toBe(27);
    expect(coordenadasDeCelda('AB1').col).toBe(28);
    expect(coordenadasDeCelda('AZ1').col).toBe(52);
    expect(coordenadasDeCelda('BA1').col).toBe(53);
  });

  it('las coordenadas empiezan en 1, como en la interfaz de Excel', () => {
    // ExcelJS ancla las imagenes con indices que empiezan en 0, por eso los
    // generadores restan 1 al usar este resultado.
    expect(coordenadasDeCelda('A1')).toEqual({ row: 1, col: 1 });
  });

  it('acepta filas de varios digitos', () => {
    expect(coordenadasDeCelda('C1048576').row).toBe(1048576);
  });

  it('ignora el signo de referencia absoluta', () => {
    // Los simbolos $ se descartan junto con el resto de caracteres.
    expect(coordenadasDeCelda('$D$7')).toEqual({ row: 7, col: 4 });
  });

  it('solo entiende MAYUSCULAS: en minusculas la columna sale 0', () => {
    // Comportamiento heredado de las 15 copias que esta funcion sustituye.
    // Se documenta en vez de corregirse en silencio: todas las referencias del
    // modulo estan en mayusculas, y cambiarlo ahora seria alterar 15 formatos
    // de Excel a la vez sin necesidad.
    expect(coordenadasDeCelda('b12')).toEqual({ row: 12, col: 0 });
  });
});
