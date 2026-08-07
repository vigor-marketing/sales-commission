import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeBasePath(value: string): string {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(env.VITE_APP_BASE_PATH || '/');
  const apiPrefix = `${base}api`;

  return {
    base,
    plugins: [react()],
    build: {
      emptyOutDir: false,
    },
    server: {
      port: 5173,
      proxy: {
        [apiPrefix]: {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${base.replace(/\/$/, '')}/api`), '/api'),
        },
      },
    },
  };
});
