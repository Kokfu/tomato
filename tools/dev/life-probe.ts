// N1-M6: look at the ambient traffic and the walkers. Teleports to a place, lets the streets fill, prints what is
// there and saves close-ups of the nearest vehicles and walkers (the walking camera is put beside each one).
// Usage: node tools/dev/life-probe.ts <outDir> [--url=http://localhost:5175/] [--x=-1610 --z=1003] [--quality=medium] [--time=night] [--mobile] [--seconds=6] [--cpu=4]
//        [--ab=20] [--turn]
// --ab=N: the cost of the traffic and the walkers, measured in ONE page so that a machine whose speed drifts does not
// spoil it: N pairs of 3 s windows, alternately with them (on) and without (`life.suspended`, as ?life=0), comparing
// the frame times of the interleaved windows. --turn: the camera turns slowly meanwhile (everything comes into view).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const url = opt('url', 'http://localhost:5175/'), mobile = rest.includes('--mobile');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } });
const page = await ctx.newPage();
const cpu = +opt('cpu', '1');
if (cpu > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
const q = opt('quality', '');
if (q) await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement).click(), q);
const time = opt('time', '');
if (time) await page.evaluate((t) => (window as any).__k3d.world.setTime(t), time);
const t0 = Date.now();
await page.waitForFunction(() => { const l = (window as any).__k3d.life; return l && l.active && l.render.walkerTriangles > 0; }, null, { timeout: 30000 });
console.log('life ready after', Date.now() - t0, 'ms');
await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, [+opt('x', '-1610'), +opt('z', '1003')]);
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 });
await page.waitForTimeout(+opt('seconds', '6') * 1000);
const stats = await page.evaluate(() => {
  const k = (window as any).__k3d, l = k.life, r = k.renderer.info, p = k.player.position;
  const why: Record<string, number> = {};
  for (const v of l.traffic.vehicles) why[v.why || 'free'] = (why[v.why || 'free'] ?? 0) + 1;
  return { ...l.stats, why, kinds: l.traffic.vehicles.map((v: any) => v.kind).join(''), arcade: l.walkers.list.filter((w: any) => w.arcade).length, standing: l.walkers.list.filter((w: any) => w.stand).length,
    costMs: +l.cost.toFixed(2), costMaxMs: +l.costMax.toFixed(2), routesBuilt: l.walkers.built, calls: r.render.calls, tris: r.render.triangles, programs: r.programs.length, fps: +k.fps.toFixed(1),
    nearestVehicle: Math.min(...l.traffic.vehicles.map((v: any) => Math.hypot(v.x - p.x, v.z - p.z))).toFixed(0) };
});
console.log(JSON.stringify(stats));
const ab = +opt('ab', '0');
if (ab > 0) {
  const res = await page.evaluate(([pairs, turn]) => new Promise<any>((resolve) => {
    const k = (window as any).__k3d, l = k.life, on: number[] = [], off: number[] = [], WINDOW = 3000, SKIP = 400;
    const pairsOn: number[] = [], pairsOff: number[] = [];
    let cur: number[] = [], start = performance.now(), last = start, phase = 0;
    const median = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const tick = () => {
      const now = performance.now(), dt = now - last;
      last = now;
      if (turn) k.tpc.yaw += 0.004;
      if (now - start > SKIP) cur.push(dt); // (the first frames after a switch are left out)
      if (now - start >= WINDOW) {
        const state = phase % 2 === 0 ? 'on' : 'off';
        (state === 'on' ? on : off).push(...cur); (state === 'on' ? pairsOn : pairsOff).push(median(cur));
        phase++; cur = []; start = now;
        if (phase >= pairs * 2) { l.suspended = false; return resolve({ on, off, pairsOn, pairsOff }); }
        l.suspended = phase % 2 === 1;
      }
      requestAnimationFrame(tick);
    };
    l.suspended = false;
    requestAnimationFrame(tick);
  }), [ab, rest.includes('--turn')] as const);
  const q = (a: number[], p: number) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  // per pair of neighbouring windows: how much longer the median frame is with the traffic and the walkers
  const ratios = res.pairsOn.map((m: number, i: number) => m / res.pairsOff[i]).sort((x: number, y: number) => x - y);
  const out = {
    frames: [res.on.length, res.off.length],
    on: { mean: +mean(res.on).toFixed(2), median: +q(res.on, 0.5).toFixed(2), p95: +q(res.on, 0.95).toFixed(2), p99: +q(res.on, 0.99).toFixed(2), over100: res.on.filter((x: number) => x > 100).length },
    off: { mean: +mean(res.off).toFixed(2), median: +q(res.off, 0.5).toFixed(2), p95: +q(res.off, 0.95).toFixed(2), p99: +q(res.off, 0.99).toFixed(2), over100: res.off.filter((x: number) => x > 100).length },
    meanPct: +((mean(res.on) / mean(res.off) - 1) * 100).toFixed(1), p95Pct: +((q(res.on, 0.95) / q(res.off, 0.95) - 1) * 100).toFixed(1),
    pairMedianPct: { median: +((ratios[ratios.length >> 1] - 1) * 100).toFixed(1), quartiles: [+((ratios[ratios.length >> 2] - 1) * 100).toFixed(1), +((ratios[(ratios.length * 3) >> 2] - 1) * 100).toFixed(1)] },
  };
  console.log('AB', JSON.stringify(out));
}
await page.screenshot({ path: `${outDir}/overview.jpg`, type: 'jpeg', quality: 85 });
// close-ups: stand 6 m to the side of the nearest vehicles and 3.5 m in front of the nearest walkers, looking at them
for (const what of ['vehicle', 'vehicle2', 'kapcai', 'walker', 'walker2']) {
  const ok = await page.evaluate((what) => {
    const k = (window as any).__k3d, l = k.life, p = k.player.position;
    const by = (a: any, b: any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z);
    const cars = l.traffic.vehicles.filter((v: any) => (what === 'kapcai') === (v.kind === 3)).sort(by), walkers = l.walkers.list.filter((w: any) => !w.stand).sort(by);
    const t = what === 'vehicle' || what === 'kapcai' ? cars[0] : what === 'vehicle2' ? cars[1] : what === 'walker' ? walkers[0] : walkers[1];
    if (!t) return false;
    const d = what.startsWith('walker') ? 3.2 : 6.5, a = t.heading + (what.startsWith('walker') ? 0.5 : 1.0);
    const x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
    k.player.teleport(x, z);
    k.tpc.firstPerson = true; k.player.visual.root.visible = false;
    k.tpc.yaw = Math.atan2(x - t.x, z - t.z); k.tpc.pitch = 0.12; k.tpc.snap();
    return true;
  }, what);
  if (!ok) { console.log('no', what); continue; }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${outDir}/${what}.jpg`, type: 'jpeg', quality: 88 });
}
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].filter((e) => !/WebSocket|websocket|Vite server/.test(e)).slice(0, 12).join('\n'));
await browser.close();
