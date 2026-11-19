import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig(
  // android/ is the Capacitor project: generated Java and Gradle files, plus a
  // copy of the web build that `npx cap sync` puts there.
  { ignores: ['dist/', 'coverage/', 'test-results/', 'playwright-report/', 'android/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // A parameter or variable whose name starts with an underscore is unused on
  // purpose (for example in a stub that has to keep a fixed signature).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Architecture rule: the engine is pure. It must not reach into the
  // renderer, the app, Three.js, or any source of non-determinism.
  {
    files: ['src/engine/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/render', '**/app/**', '**/app'],
              message: 'src/engine must not import from src/render or src/app.',
            },
            { group: ['three', 'three/*'], message: 'src/engine must not import Three.js.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in src/engine.' },
        { name: 'document', message: 'No DOM in src/engine.' },
        { name: 'Date', message: 'No Date in src/engine; time comes from shifts.' },
        { name: 'setTimeout', message: 'No timers in src/engine.' },
        { name: 'setInterval', message: 'No timers in src/engine.' },
        { name: 'requestAnimationFrame', message: 'No timers in src/engine.' },
        { name: 'performance', message: 'No wall-clock time in src/engine.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG stored in GameState.' },
      ],
    },
  },
  // The render layer may use Three.js but must not depend on the app layer.
  {
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/app/**', '**/app'], message: 'src/render must not import from src/app.' },
          ],
        },
      ],
    },
  },
);
