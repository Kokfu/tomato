import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize } from 'node:path';

// Serves the static build from a sub-path with a plain file server (no Vite), the way any
// static host would, and checks that the game boots and streams chunks from there.
const PREFIX = '/kuching-3d/';
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
let server: Server;
let port = 0;

test.beforeAll(async () => {
  execSync('npm run build', { stdio: 'pipe' });
  server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!url.startsWith(PREFIX)) { res.writeHead(404).end(); return; }
    let rel = url.slice(PREFIX.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join('dist', rel));
    if (!file.startsWith('dist') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

test.describe('production', () => {
  test('static build boots from a sub-path and is playable', async ({ page }) => {
    const errors: string[] = [];
    const urls: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { urls.push(r.url()); if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    // N1-M8: a saved choice skips the first-launch character picker (on by default since N1-M1)
    await page.addInitScript(() => { try { localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } });
    await page.goto(`http://127.0.0.1:${port}${PREFIX}`);
    await page.waitForFunction(() => (window as any).__k3d?.ready === true, null, { timeout: 90_000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90_000 });
    // Walk a little to prove input, collision and rendering work in the built app.
    const before = await page.evaluate(() => (window as any).__k3d.player.position.toArray());
    await page.evaluate(() => { (window as any).__k3d.tpc.yaw = Math.PI / 2; });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => (window as any).__k3d.player.position.toArray());
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(1.5);
    expect(await page.evaluate(() => (window as any).__k3d.renderer.info.render.triangles)).toBeGreaterThan(3000);
    // Everything was served from the sub-path: no absolute-root or third-party requests.
    const outside = urls.filter((u) => !u.startsWith(`http://127.0.0.1:${port}${PREFIX}`) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(outside).toEqual([]);
    expect(urls.some((u) => u.includes('/data/kuching/chunks/'))).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'docs/screenshots/production-build.png' });
  });

  test('initial download stays within the size targets', async () => {
    const gz = (p: string) => gzipSync(readFileSync(p)).length;
    let app = 0;
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== 'data') walk(p); } else app += gz(p);
      }
    };
    walk('dist');
    const core = ['manifest.json', 'height.bin', 'landmarks.json'].reduce((s, f) => s + gz(join('dist/data/kuching', f)), 0);
    console.log(`application assets (gzip, excluding map data): ${(app / 1e6).toFixed(2)} MB; core map files (gzip): ${(core / 1e6).toFixed(2)} MB`);
    expect(existsSync('dist/index.html')).toBe(true);
    expect(app).toBeLessThan(5e6);
    expect(core).toBeLessThan(10e6);
  });
});
