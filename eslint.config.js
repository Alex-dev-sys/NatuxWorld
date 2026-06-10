// Flat ESLint config (ESLint 9+). Run with `npm run lint`.
// Requires devDeps: eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', 'build/**', '.claude/**', '*.config.js', '*.config.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript already resolves identifiers (process, __dirname, console, DOM
      // globals); the core no-undef rule double-flags them and is explicitly
      // recommended OFF for TS by typescript-eslint.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Tests use require() for lazy node builtins and loose typing.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
