import { sanearCuerpo } from './sanitizar';

describe('sanearCuerpo', () => {
  it('no guarda las contraseñas del cambio de contraseña', () => {
    const guardado = JSON.stringify(
      sanearCuerpo({
        currentPassword: 'Actual@2025',
        newPassword: 'Nueva#2026',
      }),
    );
    expect(guardado).not.toContain('Actual@2025');
    expect(guardado).not.toContain('Nueva#2026');
  });
});
