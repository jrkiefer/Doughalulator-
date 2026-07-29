/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths so the app works from GitHub Pages' subfolder address.
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
