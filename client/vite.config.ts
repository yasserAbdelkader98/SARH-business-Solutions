import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, envDir, '');
  const port = Number(env.CLIENT_PORT);
  const apiPort = Number(env.API_PORT);
  if (![port, apiPort].every((value) => Number.isInteger(value) && value > 0 && value <= 65535)) {
    throw new Error('Set valid API_PORT and CLIENT_PORT values in client/.env.');
  }
  return {
    plugins: [react()],
    envDir,
    server: {
      port,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
  };
});
