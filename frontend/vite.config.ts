import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

// The backend's dev port; /auth and /api are proxied so dev runs on one origin.
const BACKEND = 'http://localhost:8789';

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
    eslint({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      emitWarning: true,
      emitError: false,
      failOnWarning: false,
      failOnError: false,
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/auth': BACKEND,
      '/api': BACKEND,
    },
  },
  base: '/ical-display/',
  resolve: {
    alias: {
      '@components': path.resolve(import.meta.dirname, './src/components'),
      '@api': path.resolve(import.meta.dirname, './src/api'),
      '@global': path.resolve(import.meta.dirname, './src/global'),
    },
  },
});
