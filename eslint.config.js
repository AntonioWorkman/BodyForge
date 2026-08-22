const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'coverage/**', 'assets/**'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'warn',
      eqeqeq: ['error', 'smart'],
      // Unused locals and parameters are caught by TypeScript itself
      // (noUnusedLocals / noUnusedParameters), so this stays off here.
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'src/testing/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Node-side config and tooling files, which run outside the app bundle.
    files: [
      'jest.setup.js',
      'jest.config.js',
      'babel.config.js',
      'eslint.config.js',
      'metro.config.js',
      'index.js',
      'scripts/**/*.js',
    ],
    languageOptions: {
      globals: {
        global: 'writable',
        jest: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Reanimated shared values are mutable handles by design: `value.value = x`
    // is the documented way to drive an animation, on the UI thread as well as
    // from JS. The immutability rule reads those writes as mutating state, so
    // it is turned off where shared values are used.
    files: [
      'src/components/Button.tsx',
      'src/components/Stepper.tsx',
      'src/core/**/*.tsx',
      'src/features/**/*.tsx',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
];
