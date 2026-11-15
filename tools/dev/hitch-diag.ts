// Explains slow frames during a short run along Jalan Main Bazaar: for every frame over 33 ms it
// records how long renderer.render took and whether a chunk build / decoration happened in it.
// Usage: node tools/dev/hitch-diag.ts [--url=http://localhost:4174/] [--quality=medium] [--seconds=25]
import { chromium } from '@playwright/test';
const opt = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, opt('quality', 'medium'));
await page.goto(opt('url', 'http://localhost:4174/'));
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120000 });
await page.click('#btn-start');
await page.evaluate(() => { const el = document.getElementById('opt-adaptive') as HTMLInputElement; el.checked = false; el.dispatchEvent(new Event('change')); });
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const pre = opt('eval', '');
if (pre) await page.evaluate(pre);
const r = await page.evaluate((seconds) => new Promise<any>((resolve) => {
  const k = (window as any).__k3d, ch = k.world.chunks;
  const ROUTE = [[118, -143], [186, -100], [256, -47], [325, 0], [420, 62]];
  let renderMs = 0;
  const orig = k.renderer.render.bind(k.renderer);
  k.renderer.render = (s: any, c: any) => { const a = performance.now(); orig(s, c); renderMs = performance.now() - a; };
  k.player.teleport(ROUTE[0][0], ROUTE[0][1]);
  let wp = 1, last = performance.now(), built = ch.stats.built, prof = JSON.stringify(ch.buildProfile);
  const t0 = last, slow: any[] = [];
  let frames = 0, withBuild = 0, withoutBuild = 0;
  const tick = () => {
    const now = performance.now(), dt = now - last; last = now; frames++;
    const didBuild = ch.stats.built !== built || JSON.stringify(ch.buildProfile) !== prof;
    if (dt > 33.4) {
      if (didBuild) withBuild++; else withoutBuild++;
      if (slow.length < 40) slow.push({ t: +((now - t0) / 1000).toFixed(1), dt: +dt.toFixed(0), render: +renderMs.toFixed(0), build: didBuild ? +ch.stats.lastBuildMs.toFixed(0) : 0, calls: k.renderer.info.render.calls, progs: k.renderer.info.programs.length });
    }
    built = ch.stats.built; prof = JSON.stringify(ch.buildProfile);
    const p = k.player.position;
    let dx = ROUTE[wp][0] - p.x, dz = ROUTE[wp][1] - p.z;
    if (Math.hypot(dx, dz) < 4 && wp < ROUTE.length - 1) { wp++; dx = ROUTE[wp][0] - p.x; dz = ROUTE[wp][1] - p.z; }
    const want = Math.atan2(-dx, -dz); let d = want - k.tpc.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    k.tpc.yaw += d * Math.min(1, dt / 250);
    k.input.touchY = 1; k.input.touchRun = true;
    if (now - t0 < seconds * 1000) return requestAnimationFrame(tick);
    k.input.touchY = 0;
    resolve({ frames, slowWithBuild: withBuild, slowWithoutBuild: withoutBuild, slow });
  };
  requestAnimationFrame(tick);
}), Number(opt('seconds', '25')));
console.log(JSON.stringify({ frames: r.frames, slowWithBuild: r.slowWithBuild, slowWithoutBuild: r.slowWithoutBuild }));
if (process.argv.includes('--list')) for (const s of r.slow) console.log(JSON.stringify(s));
await browser.close();
