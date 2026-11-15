// Attributes GPU frame time to features at one fixed view (Jalan Main Bazaar), using timer queries.
// Usage: node tools/dev/gpu-probe.ts [--url=http://localhost:4174/] [--quality=high]
import { chromium } from '@playwright/test';
const opt = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl-draft-extensions'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, opt('quality', 'high'));
await page.goto(opt('url', 'http://localhost:4174/'));
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120000 });
await page.click('#btn-start');
await page.evaluate(() => {
  const el = document.getElementById('opt-adaptive') as HTMLInputElement; el.checked = false; el.dispatchEvent(new Event('change'));
  const k = (window as any).__k3d; k.player.teleport(180, -105); k.player.heading = 0.96; k.tpc.yaw = -2.178; k.tpc.pitch = 0.08; k.tpc.distance = 4.2;
});
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 120000 });
await page.waitForTimeout(2000);
const measure = (label: string, setup: string) => page.evaluate(({ label, setup }) => new Promise<string>((resolve) => {
  const k = (window as any).__k3d;
  new Function('k', setup)(k);
  const gl: WebGL2RenderingContext = k.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return resolve(`${label}: timer queries unavailable`);
  const orig = k.renderer.render;
  const pending: WebGLQuery[] = [], gpu: number[] = [];
  let n = 0;
  k.renderer.render = function (s: any, c: any) {
    let q: WebGLQuery | null = null;
    if (n > 20 && pending.length < 6) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q!); }
    orig.call(k.renderer, s, c);
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) { const p = pending.shift()!; gpu.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(p); }
    if (++n > 220) {
      k.renderer.render = orig;
      gpu.sort((a, b) => a - b);
      resolve(`${label}: gpu median ${gpu[gpu.length >> 1]?.toFixed(2)} ms, calls ${k.renderer.info.render.calls}, tris ${k.renderer.info.render.triangles}`);
    }
  };
}), { label, setup });
const STRIP = `k.world.scene.traverse((o) => { const m = o.material; if (m && m.customProgramCacheKey && String(m.customProgramCacheKey()).startsWith('k3d-')) { m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'plain'; m.needsUpdate = true; } });`;
const REFRESH = `k.world.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });`;
console.log(await measure('as shipped', ''));
console.log(await measure('roof detail stripped', "const m = k.world.materials.roofs; m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'plainroof'; m.needsUpdate = true;"));
console.log(await measure('roofs not casting shadows', "k.world.chunks.group.traverse((o) => { if (o.material === k.world.materials.roofs) o.castShadow = false; });"));
console.log(await measure('roofs not receiving shadows', "k.world.chunks.group.traverse((o) => { if (o.material === k.world.materials.roofs) { o.castShadow = true; o.receiveShadow = false; } }); k.world.materials.roofs.needsUpdate = true;"));
await browser.close();
