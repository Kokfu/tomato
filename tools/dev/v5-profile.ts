// Frame-time measurements for the V5 report: V4, V5 procedural (A) and V5 hybrid (B) at three of
// the gate viewpoints, per graphics preset, with adaptive resolution and vsync off so the numbers
// are real frame costs. Also reports renderer memory counters and the JS heap.
// Usage: node tools/dev/v5-profile.ts [url] [--mobile] [--out=docs/perf-v5.json]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3000/';
const mobile = args.includes('--mobile');
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1];
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready && (window as any).__k3d.v5, null, { timeout: 90000 });
await page.click('#btn-start');
await page.evaluate(() => { const c = document.querySelector('#opt-adaptive') as HTMLInputElement; if (c?.checked) c.click(); });
const gpu = await page.evaluate(() => { const gl = (window as any).__k3d.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
console.log('GPU:', gpu, mobile ? '(mobile emulation 390x844 @2x, touch)' : '(1280x720)');
const results: any = { gpu, viewport: mobile ? '390x844@2x' : '1280x720', rows: [] };
const presets = mobile ? ['low'] : ['medium', 'high'];
for (const preset of presets) {
  await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement)?.click(), preset);
  for (const mode of ['v4', 'a', 'b']) {
    await page.evaluate(() => { const k = (window as any).__k3d; k.player.teleport(127.38, 5.63); });
    await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90000 }).catch(() => 0);
    await page.evaluate((m) => (window as any).__k3d.v5.setMode(m), mode);
    await page.waitForFunction((m) => { const k = (window as any).__k3d; return k.v5.mode === m && !k.v5.busy && k.world.chunks.progress() >= 0.999 && k.world.landmarkModels.settled; }, mode, { timeout: 60000 }).catch(() => 0);
    for (const vi of [0, 3, 4]) {
      const r = await page.evaluate(async (vi) => {
        const k = (window as any).__k3d, v = k.v5.views[vi];
        k.player.teleport(v.x, v.z); k.tpc.yaw = v.yaw; k.tpc.pitch = v.pitch; k.tpc.distance = v.dist; k.player.heading = v.heading; k.tpc.snap();
        await new Promise((r) => setTimeout(r, 2500));
        const t: number[] = [];
        await new Promise<void>((res) => { let last = performance.now(); const f = () => { const n = performance.now(); t.push(n - last); last = n; if (t.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        t.sort((a, b) => a - b);
        const i = k.renderer.info, m = k.v5.measure();
        return { view: v.name, avgMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), p50: +t[120].toFixed(2), p95: +t[228].toFixed(2), p99: +t[237].toFixed(2), fps: +(1000 / (t.reduce((a, b) => a + b, 0) / t.length)).toFixed(1), pixelRatio: +k.renderer.getPixelRatio().toFixed(2),
          calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, heapMB: +(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(0),
          v5Triangles: m.v5Triangles, v5Calls: m.v5DrawCalls, v5GeometryMB: +(m.v5GeometryBytes / 1048576).toFixed(2), v5TextureMB: +(m.v5TextureBytes / 1048576).toFixed(2), pipelineTargetsMB: +(m.pipelineTargetBytes / 1048576).toFixed(1), buildMs: m.v5BuildMs, assetKB: +(m.v5AssetBytes / 1024).toFixed(0) };
      }, vi);
      results.rows.push({ preset, mode, ...r });
      console.log(preset.padEnd(7), mode.padEnd(3), r.view.padEnd(26), `${r.fps} fps  avg ${r.avgMs}  p95 ${r.p95}  calls ${r.calls}  tris ${r.triangles}  tex ${r.textures}  heap ${r.heapMB} MB`);
    }
  }
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
