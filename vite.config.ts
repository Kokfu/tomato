import { defineConfig, loadEnv } from 'vite';

// Relative base so the static build can be hosted from any sub-path (e.g. GitHub Pages).
// Host/port/public-hostname come from .env (see .env.example) so the same config serves
// localhost, the LAN and the public DuckDNS name (router forwards external :3000 -> this machine :3000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.HOST || '0.0.0.0'; // all interfaces, so forwarded traffic is accepted
  const port = Number(env.PORT) || 3000;
  const publicHost = env.PUBLIC_HOST || 'kuching.duckdns.org';
  const publicPort = Number(env.PUBLIC_PORT) || port;

  const common = {
    host,
    port,
    strictPort: true,
    // Vite rejects unknown Host headers (DNS-rebinding protection); allow the DuckDNS name explicitly.
    allowedHosts: [publicHost, 'localhost', '127.0.0.1'],
  };

  return {
    base: './',
    server: {
      ...common,
      // HMR websocket goes back through the same public host:port when opened remotely.
      hmr: { host: undefined, clientPort: publicPort },
      // Do not watch agent worktrees or the raw data cache.
      watch: { ignored: ['**/.claude/**', '**/data-src/**', '**/test-results/**'] },
    },
    preview: common,
    // Pre-bundle the lazily imported three.js add-ons, so the dev server never re-optimises and reloads the page mid-session.
    optimizeDeps: { include: ['three/addons/loaders/GLTFLoader.js', 'three/addons/libs/meshopt_decoder.module.js', 'three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/RenderPass.js', 'three/addons/postprocessing/GTAOPass.js', 'three/addons/postprocessing/OutputPass.js', 'three/addons/postprocessing/ShaderPass.js', 'three/addons/shaders/FXAAShader.js'] },
    build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  };
});
