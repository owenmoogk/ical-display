/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin. Default: same origin in dev (Vite proxy), ical.owenmoogk.com in prod. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The package ships types, but its "exports" map hides them from Bundler resolution.
declare module 'vite-plugin-eslint' {
  import type { Plugin } from 'vite';
  export default function eslint(options?: Record<string, unknown>): Plugin;
}
