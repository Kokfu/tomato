// Capture screenshots of the running app at given views (dev utility, also used for docs).
// Usage: node tools/dev/shots.ts <outDir> '<json views>' [--url=http://localhost:5173/] [--size=1280x720] [--mobile]
// A view: { name, lm?: landmarkId, lat?, lon?, yaw?, pitch?, dist?, fp?: boolean, map?: boolean, wait?: ms }
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, viewsJson, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:5173/');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const mobile = rest.includes('--mobile');
const views = JSON.parse(viewsJson);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
for (const v of views) {
  await page.evaluate((v) => {
    const k = (window as any).__k3d;
    if (v.lm) { const l = k.world.landmarks.landmarks.find((x: any) => x.id === v.lm); k.player.teleport(l.x + (v.dx ?? 0), l.z + (v.dz ?? 0)); }
    else if (v.lat !== undefined) k.teleportGeo(v.lat, v.lon);
    if (v.yaw !== undefined) k.tpc.yaw = v.yaw;
    if (v.pitch !== undefined) k.tpc.pitch = v.pitch;
    if (v.dist !== undefined) k.tpc.distance = v.dist;
    if (v.heading !== undefined) k.player.heading = v.heading;
    if (v.quality) (document.querySelector(`#quality-seg [data-q="${v.quality}"]`) as HTMLElement).click();
  }, v);
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 }).catch(() => errors.push('chunk load timeout'));
  await page.waitForTimeout(v.wait ?? 700);
  await page.screenshot({ path: `${outDir}/${v.name}.png` });
  const info = await page.evaluate(() => { const k = (window as any).__k3d; const r = k.renderer.info; return { fps: +k.fps.toFixed(1), calls: r.render.calls, tris: r.render.triangles, geo: r.memory.geometries, tex: r.memory.textures, chunks: k.world.chunks.loadedCount, pos: k.player.position.toArray().map((n: number) => +n.toFixed(1)) }; });
  console.log(v.name, JSON.stringify(info));
}
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
