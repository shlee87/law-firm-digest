import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.planning/',
      '.gsd-patches/',
      '.claude/',
      '.opencode/',
      '.agents/',
    ],
  },
);
