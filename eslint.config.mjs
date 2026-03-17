import jsdoc from 'eslint-plugin-jsdoc';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'docs/adr/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      jsdoc: jsdoc,
      'unused-imports': unusedImports,
      import: importPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'require-await': 'off',
      '@typescript-eslint/require-await': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          paths: [],
          patterns: [
            {
              group: ['**/repositories/**'],
              message: 'Routes must use Services. Do not import repositories directly.',
            },
            {
              group: ['**/routes/**', '**/handlers/**'],
              message: 'Services should be decoupled from Route handlers.',
            },
          ],
        },
      ],

      'jsdoc/require-jsdoc': ['error', { publicOnly: true }],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param': 'error',
      'jsdoc/require-returns': 'error',

      ...prettierConfig.rules,
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/routes/**', '**/handlers/**'],
              message: 'Services should be decoupled from Route handlers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['vitest.config.ts', 'eslint.config.mjs'],
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    files: ['src/app.ts'],
    rules: { 'no-restricted-imports': 'off' }
  }
];
