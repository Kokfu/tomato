import { defineConfig } from 'vite';

// Relative base so the static build can be hosted from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  // Do not watch agent worktrees or the raw data cache.
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/.claude/**', '**/data-src/**', '**/test-results/**'] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
