import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function computeDataHash(commit: string): string {
  const h = createHash('sha256').update(commit);
  for (const f of [
    'public/data/kuching/manifest.json',
    'public/data/kuching/streetscape-report.json',
    'public/data/kuching/places/index.json',
    'public/data/kuching/jobs.json',
    'public/data/kuching/drive-graph.json',
  ]) {
    if (existsSync(f)) h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 10);
}

/** What is actually being built: the release (from the last commit's "Vn:" prefix), the commit, uncommitted changes and the date. */
function buildInfo(command: string) {
  const git = (args: string) => { try { return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const subject = git('log -1 --format=%s');
  const commit = git('rev-parse --short HEAD');
  return {
    release: /^(V\d+(?:\.\d+)*)\b/.exec(subject)?.[1] ?? '',
    package: JSON.parse(readFileSync('package.json', 'utf8')).version as string,
    commit,
    dataHash: computeDataHash(commit),
    modified: git('status --porcelain --untracked-files=no') !== '',
    date: new Date().toISOString().slice(0, 10),
    dev: command === 'serve',
  };
}

// Relative base so the static build can be hosted from any sub-path (e.g. GitHub Pages).
// Host/port/public-hostname come from .env (see .env.example) so the same config serves
// localhost, the LAN and the public DuckDNS name (router forwards external :3000 -> this machine :3000).
export default defineConfig(({ mode, command }) => {
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
    define: { __K3D_BUILD__: JSON.stringify(buildInfo(command)) },
    server: {
      ...common,
      // HMR websocket goes back through the same public host:port when opened remotely.
      hmr: { host: undefined, clientPort: publicPort },
      // Do not watch agent worktrees, build outputs, docs/screenshots, or the raw data cache.
      watch: { ignored: ['**/.claude/**', '**/data-src/**', '**/test-results/**', '**/dist/**', '**/docs/**'] },
    },
    preview: common,
    // Pre-bundle the lazily imported three.js add-ons, so the dev server never re-optimises and reloads the page mid-session.
    optimizeDeps: { include: ['three/addons/loaders/GLTFLoader.js', 'three/addons/libs/meshopt_decoder.module.js', 'three/addons/utils/SkeletonUtils.js', 'three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/RenderPass.js', 'three/addons/postprocessing/GTAOPass.js', 'three/addons/postprocessing/OutputPass.js', 'three/addons/postprocessing/ShaderPass.js', 'three/addons/shaders/FXAAShader.js'] },
    build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  };
});
