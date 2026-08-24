/**
 * Build + test configuration, one file. `defineConfig` comes from
 * vitest/config (a superset of Vite's) so the `test` block is typed without
 * a triple-slash reference.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths so the app works from GitHub Pages' subfolder address —
  // the site is served at /<repo>/, not at the domain root.
  base: './',
  plugins: [react()],
  test: {
    // Everything tested is pure logic or the faked Apps Script world; no DOM
    // is ever needed, so plain node keeps the suite dependency-free and fast.
    environment: 'node',
  },
});
