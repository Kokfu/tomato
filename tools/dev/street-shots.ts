// Fixed-camera captures of the Jalan China test section (the V7 visual quality gate).
// Usage: node tools/dev/street-shots.ts <outDir> [--url=http://localhost:3000/] [--size=1280x960] [--mode=c] [--quality=high] [--prefix=after-] [--views=file.json] [--stats]
// Cameras are OP fly-mode poses (world metres, eye height above local ground, yaw, pitch, vertical FOV).
// Without --mode the app's default rendering is captured (the "before" state).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const url = opt('url', 'http://localhost:3000/');
const [w, h] = opt('size', '1280x960').split('x').map(Number);
const mode = opt('mode', '');
const quality = opt('quality', 'high');
const prefix = opt('prefix', '');
const mobile = rest.includes('--mobile');
// `peds` (only with the pedestrian prototype switched on, ?peds=on): [pedestrian index, station in metres, walking, heading north] held in place for the capture.
const views: { name: string; x: number; z: number; eye: number; yaw: number; pitch: number; fov: number; peds?: [number, number, boolean, boolean][] }[] = JSON.parse(readFileSync(opt('views', '') || new URL('./street-views.json', import.meta.url), 'utf8'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } }); // N1-M1: skip the first-launch character picker
const page = await ctx.newPage();
const errors: string[] = [];
let bytes = 0;
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { void r.body().then((b) => (bytes += b.length)).catch(() => {}); });
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
const initialBytes = bytes;
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement | null)?.click(), quality);
await page.evaluate(() => { const a = document.querySelector('#opt-adaptive') as HTMLInputElement | null; if (a?.checked) a.click(); });
await page.addStyleTag({ content: '#hud, #v5bar, #ref-panel { visibility: hidden !important; }' });

const out: Record<string, unknown>[] = [];
let first = true;
for (const v of views) {
  await page.evaluate(async ({ v, mode, first }) => {
    const k = (window as any).__k3d;
    if (first) {
      // Move the walking character next to the section first, so that streaming and any section switch settle there.
      k.player.teleport(v.x, v.z); k.tpc.snap();
    }
    if (!k.fly.active) k.fly.toggle();
    const ground = k.world.height.sample(v.x, v.z);
    k.fly.position.set(v.x, ground + v.eye, v.z); k.fly.yaw = v.yaw; k.fly.pitch = v.pitch;
    if ('fov' in k.fly) k.fly.fov = v.fov;
    else Object.defineProperty(k.camera, 'fov', { configurable: true, get: () => v.fov, set: () => {} });
    k.camera.updateProjectionMatrix();
    if (first && mode && k.v5) await k.v5.setMode(mode);
    if (k.v5?.pedsEnabled && k.v5.mode === 'c' && v.peds) {
      for (let i = 0; i < 100 && !k.v5.peds?.active; i++) await new Promise((r) => setTimeout(r, 100));
      for (const [i, s, walking, north] of v.peds) k.v5.peds.list[i]?.place(s, walking, north, k.v5.peds.host);
    }
  }, { v, mode, first });
  first = false;
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => errors.push('chunk load timeout'));
  await page.waitForFunction(() => (window as any).__k3d.world.landmarkModels?.settled !== false, null, { timeout: 30000 }).catch(() => errors.push('landmark model load timeout'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__k3d.camera.updateProjectionMatrix());
  await page.waitForTimeout(300);
  await page.screenshot(rest.includes('--jpeg') ? { path: `${outDir}/${prefix}${v.name}.jpg`, type: 'jpeg', quality: 85 } : { path: `${outDir}/${prefix}${v.name}.png` });
  const info = await page.evaluate(() => {
    const k = (window as any).__k3d, r = k.renderer.info;
    return { fps: +k.fps.toFixed(1), calls: r.render.calls, tris: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, chunks: k.world.chunks.loadedCount, heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576), v5: k.v5?.mode !== 'v4' ? k.v5?.measure?.() : undefined };
  });
  out.push({ view: v.name, ...info });
  console.log(v.name, JSON.stringify(info));
}
const summary = { url, mode: mode || 'default', quality, size: `${w}x${h}`, mobile, initialBytes, totalBytes: bytes, views: out, console: [...new Set(errors)] };
console.log('initial bytes', initialBytes, 'total bytes', bytes);
if (rest.includes('--stats')) writeFileSync(`${outDir}/${prefix}stats.json`, JSON.stringify(summary, null, 1));
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
