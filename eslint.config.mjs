// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // ── Deuda de tipado: aviso, no error ─────────────────────────────
      //
      // `yarn lint` terminaba siempre en codigo 1 con ~1.660 errores, y por eso
      // habia dejado de servir: no se distingue un error nuevo entre 1.660
      // viejos, ni se puede poner como puerta en CI.
      //
      // Estas reglas se degradan a AVISO para recuperar el linter como señal.
      // No es una amnistia: la familia `no-unsafe-*` son consecuencias de los
      // `any` que quedan, asi que la cuenta baja sola segun avanza la Fase 2 del
      // ANALISIS_BACKEND.md. Cuando llegue a cero, vuelven a ser error.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',

      // `async` sin `await`. Quitarlo a ciegas cambia la firma de metodos
      // publicos, asi que se revisa caso por caso, no en masa.
      '@typescript-eslint/require-await': 'warn',

      // `import x = require('y')` es necesario en este proyecto para paquetes
      // sin export default real (pdfkit): la importacion por defecto compila
      // pero revienta en ejecucion.
      '@typescript-eslint/no-require-imports': 'warn',

      // ── Reglas que SI son error ──────────────────────────────────────
      // Un parametro que empieza por `_` declara de forma explicita que no se
      // usa —normalmente para respetar una firma—. Lo demas sigue siendo error.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // En las pruebas, `expect(servicio.metodo)` es el uso normal de jest y no
    // implica ningun problema de `this`: el metodo esta simulado, no se
    // invoca. La regla solo generaria ruido aqui.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
