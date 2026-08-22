import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Gate de lint (spec §59 Definition of Done). Reglas recomendadas sin type-checking
 * pesado (ese trabajo lo hace `npm run typecheck` con tsc strict).
 */
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/web/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    // Scripts de tooling y migraciones pueden usar console.
    files: ['db/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
