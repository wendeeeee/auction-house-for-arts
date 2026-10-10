import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the API, so the browser sees one origin and no CORS is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5201,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4101',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
