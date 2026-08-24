/**
 * Flat ESLint config, one file. Three layers:
 *   1. js/ts recommended — the baseline everybody runs.
 *   2. typescript-eslint's TYPE-CHECKED recommended set — rules that read the
 *      actual types (unsafe any flows, floating promises, wrong awaits).
 *      The codebase is small enough that the extra typecheck time is nothing,
 *      and these are the rules that catch real sync-engine mistakes.
 *   3. react-hooks recommended — effect/deps correctness for the app shell.
 *
 * Code.gs files are ignored: they are Apps Script (old-style var/function
 * code executed inside Google), linted in effect by being RUN under vitest
 * through the harness instead.
 */
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'apps-script/**/Code.gs'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // projectService finds the tsconfig for each file itself — the whole
        // repo type-checks under the one tsconfig.json, so nothing to map.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The config file itself is plain JS — type-aware rules have no types to
    // read there and only produce noise.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
