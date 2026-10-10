import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The dev server proxies /api and the Socket.IO endpoint to the API, so the browser sees one
// origin and no CORS is needed. `ws: true` forwards the WebSocket upgrade.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5201,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4101',
      '/socket.io': { target: 'http://localhost:4101', ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
