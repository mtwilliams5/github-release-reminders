const eslintJs = require('@eslint/js');
const tseslintPlugin = require('@typescript-eslint/eslint-plugin');
const tseslintParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = [
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'eslint.config.js',
      'jest.config.js',
      'scripts/**/*.js',
    ],
  },

  // Base JS recommended rules
  eslintJs.configs.recommended,

  // TypeScript recommended
  ...tseslintPlugin.configs['flat/recommended'],

  // Import plugin typescript preset
  importPlugin.flatConfigs.typescript,

  // Main config for TS source files
  {
    files: ['src/**/*.ts', 'infra/**/*.ts'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
    rules: {
      'import/extensions': ['error', 'ignorePackages', { ts: 'never' }],
      'import/prefer-default-export': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message: 'Use Object.keys/values/entries instead.',
        },
      ],
    },
  },

  // Prettier must be last to disable conflicting rules
  prettierConfig,
];
