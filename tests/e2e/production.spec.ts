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
    expect(urls.some((u) => u.includes('/data/kuching/chunks/') && u.includes('?v='))).toBe(true);
    // Credits modal opens from the pause menu and carries the MIT Rocketbox notice and CC attributions.
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause')).toBeVisible();
    await page.locator('#pause-credits').click();
    await expect(page.locator('#credits')).toBeVisible();
    await expect(page.locator('#credits-body')).toContainText('Copyright (c) 2020 Microsoft');
    await expect(page.locator('#credits-body')).toContainText('CC BY-SA');
    await page.locator('#credits-close').click();
    await expect(page.locator('#credits')).toBeHidden();
    await page.locator('#pause-resume').click();
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'docs/screenshots/production-build.png' });
  });

  test('initial download stays within the size targets (measured on what a first visit actually downloads)', async ({ page }) => {
    const gz = (p: string) => gzipSync(readFileSync(p)).length;
    const fetchedPaths = new Set<string>();
    page.on('response', (r) => {
      if (r.status() >= 200 && r.status() < 300) {
        const u = new URL(r.url()).pathname;
        if (u.startsWith(PREFIX)) fetchedPaths.add(u.slice(PREFIX.length) || 'index.html');
      }
    });

    // True first visit: no saved character in localStorage, traffic & walkers ON by default.
    await page.goto(`http://127.0.0.1:${port}${PREFIX}`);
    await page.waitForFunction(() => (window as any).__k3d?.ready === true, null, { timeout: 90_000 });
    await expect(page.locator('#start-credits')).toBeVisible();
    await page.locator('#btn-start').click();
    await expect(page.locator('#char-picker')).toBeVisible();
    await page.waitForTimeout(800);
    // While the picker is open, no character GLB (including casual-character.glb) may be fetched.
    expect([...fetchedPaths].filter((p) => p.startsWith('models/characters/') && p.endsWith('.glb'))).toEqual([]);

    // Pick a character, enter the world, and let spawn chunks + traffic & walkers settle.
    await page.locator('#char-picker [role=radio][data-id=man]').click();
    await page.locator('#pk-confirm').click();
    await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
    await page.waitForFunction(() => {
      const k = (window as any).__k3d;
      return k.world.chunks.progress() >= 0.999 && k.life?.active && k.life.render.walkerTriangles > 0;
    }, null, { timeout: 90_000 });

    let app = 0, data = 0;
    for (const rel of fetchedPaths) {
      const p = normalize(join('dist', rel));
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      if (rel.startsWith('data/')) data += gz(p);
      else app += gz(p);
    }
    const charGlbs = [...fetchedPaths].filter((p) => p.startsWith('models/characters/') && p.endsWith('.glb'));
    const refs = [...fetchedPaths].filter((p) => p.startsWith('reference/'));
    console.log(`first-visit download (gzip): app ${(app / 1e6).toFixed(2)} MB (${fetchedPaths.size} files, charGlbs=${charGlbs.join(',')}), map data ${(data / 1e6).toFixed(2)} MB`);
    expect(existsSync('dist/index.html')).toBe(true);
    expect(charGlbs, 'only the chosen character GLB is downloaded, never casual-character.glb or unchosen characters').toEqual(['models/characters/man.glb']);
    expect(refs, 'OP-mode reference photographs are not downloaded on a normal visit').toEqual([]);
    expect(app).toBeLessThan(5e6);
    expect(data).toBeLessThan(10e6);
  });
});
