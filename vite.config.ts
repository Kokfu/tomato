import { defineConfig } from 'vite';

// Relative base so the static build can be hosted from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
