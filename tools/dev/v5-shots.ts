// Capture the six fixed quality-gate viewpoints in one or more render modes (V4 / V5 A / V5 B).
// Usage: node tools/dev/v5-shots.ts <outDir> [--modes=v4,a,b] [--url=http://localhost:3000/] [--size=1280x720] [--views=0,2] [--mobile] [--quality=high]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:3000/');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const modes = opt('modes', 'v4,a,b').split(',');
const only = opt('views', '').split(',').filter(Boolean).map(Number);
const mobile = rest.includes('--mobile');
const quality = opt('quality', mobile ? 'low' : 'high');

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement)?.click(), quality);
// Hide the HUD so the critic judges the rendering only.
await page.addStyleTag({ content: '#hud, .hud, #minimap, #v5bar, #controls-hint, #attribution, #place-prompt, #touch, .toast { visibility: hidden !important }' });
// Same render resolution for every mode: adaptive resolution off.
await page.evaluate(() => { const c = document.querySelector('#opt-adaptive') as HTMLInputElement; if (c?.checked) c.click(); });
const views: any[] = await page.evaluate(() => (window as any).__k3d.v5.views);
const results: Record<string, any> = {};
for (const mode of modes) {
  mkdirSync(`${outDir}/${mode}`, { recursive: true });
  await page.evaluate((v) => { const k = (window as any).__k3d; k.player.teleport(v.x, v.z); }, views[0]);
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 });
  await page.evaluate((m) => (window as any).__k3d.v5.setMode(m), mode);
  await page.waitForFunction((m) => { const k = (window as any).__k3d; return k.v5.mode === m && !k.v5.busy && k.world.chunks.progress() >= 0.999 && k.world.landmarkModels.settled; }, mode, { timeout: 60000 }).catch(async () => console.log("  mode switch wait timed out:", await page.evaluate(() => { const k = (window as any).__k3d; return JSON.stringify({ mode: k.v5.mode, busy: k.v5.busy, progress: k.world.chunks.progress(), settled: k.world.landmarkModels.settled, lm: k.world.landmarkModels.info() }); })));
  for (let i = 0; i < views.length; i++) {
    if (only.length && !only.includes(i)) continue;
    const v = views[i];
    await page.evaluate((v) => {
      const k = (window as any).__k3d;
      k.player.teleport(v.x, v.z); k.tpc.yaw = v.yaw; k.tpc.pitch = v.pitch; k.tpc.distance = v.dist; k.player.heading = v.heading; k.tpc.snap();
    }, v);
    await page.waitForFunction(() => { const k = (window as any).__k3d; return k.world.chunks.progress() >= 0.999 && k.world.landmarkModels.settled; }, null, { timeout: 60000 }).catch(() => errors.push('load timeout'));
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${outDir}/${mode}/${v.name}.png` });
    const m = await page.evaluate(() => (window as any).__k3d.v5.measure());
    results[`${mode}/${v.name}`] = m;
    console.log(mode, v.name, JSON.stringify({ fps: +(1000 / m.avgMs).toFixed(1), avgMs: m.avgMs, p95: m.p95Ms, calls: m.calls, tris: m.triangles, tex: m.textures, geo: m.geometries }));
  }
  const m = await page.evaluate(() => (window as any).__k3d.v5.measure());
  console.log(`  ${mode} scene:`, JSON.stringify({ v5Tris: m.v5Triangles, v5Calls: m.v5DrawCalls, buildMs: m.v5BuildMs, assetBytes: m.v5AssetBytes, glb: m.v5Glb, geoBytes: m.v5GeometryBytes, texBytes: m.v5TextureBytes, targetBytes: m.pipelineTargetBytes }));
}
writeFileSync(`${outDir}/measurements${mobile ? '-mobile' : ''}.json`, JSON.stringify(results, null, 1));
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].slice(0, 25).join('\n'));
await browser.close();
