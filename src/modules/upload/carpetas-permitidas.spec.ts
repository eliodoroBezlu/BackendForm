import { rutaDeCarpeta } from './carpetas-permitidas';

describe('rutaDeCarpeta', () => {
  it('resuelve las carpetas conocidas', () => {
    expect(rutaDeCarpeta('tareas')).toBe('./uploads/evidencias-tareas');
    expect(rutaDeCarpeta('linternas')).toBe('./uploads/evidencias-linternas');
  });

  it('sin clave cae en la de tareas, que es el comportamiento histórico', () => {
    expect(rutaDeCarpeta()).toBe('./uploads/evidencias-tareas');
    expect(rutaDeCarpeta(undefined)).toBe('./uploads/evidencias-tareas');
  });

  it.each(['../../etc', '/etc/passwd', 'linternas/../../..', 'inventada', ''])(
    'ignora %p en vez de construir una ruta con ello',
    (clave) => {
      expect(rutaDeCarpeta(clave)).toBe('./uploads/evidencias-tareas');
    },
  );
});
