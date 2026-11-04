import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { createPublicClientEnvDefinitions } from '../../client/vite-public-env.mjs';
import { API_HOST, API_PORT, WEB_HOST, WEB_PORT } from './boundary.mjs';

const clientRoot = fileURLToPath(new URL('../../client/', import.meta.url));
const requireFromClient = createRequire(new URL('../../client/package.json', import.meta.url));
const { defineConfig, loadEnv } = requireFromClient('vite');
const react = requireFromClient('@vitejs/plugin-react');

const env = loadEnv('development', clientRoot, '');

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  envPrefix: [],
  define: createPublicClientEnvDefinitions(env),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../client/src', import.meta.url)),
    },
  },
  server: {
    host: WEB_HOST,
    port: WEB_PORT,
    strictPort: true,
    watch: { usePolling: true, interval: 1000 },
    proxy: {
      '/api': { target: `http://${API_HOST}:${API_PORT}`, changeOrigin: true },
      '/uploads': { target: `http://${API_HOST}:${API_PORT}`, changeOrigin: true },
    },
  },
});
