// Capture screenshots of the running app at given views (dev utility, also used for docs).
// Usage: node tools/dev/shots.ts <outDir> '<json views>' [--url=http://localhost:3000/] [--size=1280x720] [--mobile]
//        [--quality=low|medium|high] [--jpeg] [--fps[=ms]]  (--fps: sample __k3d.fps for 5 s per view, writes <outDir>/fps.json)
//        [--time=<hour 0..24>|day|evening|night] [--rain=<0..1>]  (N1-M6: the clock is stopped there; default a dry day at 09:40)
// A view: { name, lm?: landmarkId, lat?, lon?, yaw?, pitch?, dist?, fp?: boolean, map?: boolean, wait?: ms, time?, rain?,
//           signal?: { jct, group, redFor }, probe?: [x, z, r], until?: 'yield'|'signal', untilMs? }  (N2-M3: phase `group` of junction `jct` has been red
//           `redFor` s at the shot; probe logs the vehicles within r m and why the stopped ones stopped)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, viewsJson, ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:3000/');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const mobile = rest.includes('--mobile');
const jpeg = rest.includes('--jpeg');
const fpsArg = rest.find((a) => a === '--fps' || a.startsWith('--fps='));
const fpsMs = fpsArg ? +(fpsArg.split('=')[1] ?? 5000) : 0;
const quality = opt('quality', '');
const timeOpt = opt('time', ''), rainOpt = opt('rain', '');
/** Stop the clock at an hour or a named setting, and set the rain (0 = dry). */
const setSky = (time: string | number | undefined, rain: string | number | undefined) => page.evaluate(([t, r]) => {
  const k = (window as any).__k3d;
  if (t !== undefined && t !== '') k.setTime(Number.isFinite(Number(t)) ? Number(t) : t);
  if (r !== undefined && r !== '') k.setRain(Number(r) > 0 ? 'on' : 'off', Number(r));
}, [time, rain] as const);
const fpsOut: Record<string, any> = {};
const views = JSON.parse(viewsJson);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } }); // N1-M1: skip the first-launch character picker
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
if (quality) await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement).click(), quality);
await setSky(timeOpt, rainOpt);
// N1-M6: the traffic and the walkers are loaded after `ready`
await page.waitForFunction(() => { const l = (window as any).__k3d.life; return !l || (l.active && l.render.walkerTriangles > 0); }, null, { timeout: 30000 }).catch(() => errors.push('life not started'));
for (const v of views) {
  await page.evaluate((v) => {
    const k = (window as any).__k3d;
    if (v.lm) { const l = k.world.landmarks.landmarks.find((x: any) => x.id === v.lm); k.player.teleport(l.x + (v.dx ?? 0), l.z + (v.dz ?? 0)); }
    else if (v.lat !== undefined) k.teleportGeo(v.lat, v.lon);
    else if (v.x !== undefined) k.player.teleport(v.x, v.z); // world metres (e.g. taken from chunk data)
    if (v.yaw !== undefined) k.tpc.yaw = v.yaw;
    if (v.pitch !== undefined) k.tpc.pitch = v.pitch;
    if (v.dist !== undefined) k.tpc.distance = v.dist;
    if (v.heading !== undefined) k.player.heading = v.heading;
    if (v.fp !== undefined) { k.tpc.firstPerson = !!v.fp; k.player.visual.root.visible = !v.fp; }
    if (v.quality) (document.querySelector(`#quality-seg [data-q="${v.quality}"]`) as HTMLElement).click();
  }, v);
  if (v.time !== undefined || v.rain !== undefined) await setSky(v.time, v.rain);
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 }).catch(() => errors.push('chunk load timeout'));
  await page.waitForFunction(() => (window as any).__k3d.world.landmarkModels?.settled !== false, null, { timeout: 30000 }).catch(() => errors.push('landmark model load timeout'));
  // N2-M3: `signal: { jct, group, redFor }` sets the traffic clock so that phase `group` of junction `jct`
  // (public/data/kuching/signals.json) has been red for `redFor` s when the shot is taken after `wait` ms.
  if (v.signal) await page.evaluate((v) => {
    const t = (window as any).__k3d.life?.traffic;
    if (!t) return;
    const { jct, group, redFor } = v.signal, cycle = 36, at = 17 + redFor - jct * 7.3 + group * (cycle / 2) - (v.wait ?? 700) / 1000;
    t.time += (((at - t.time) % cycle) + cycle) % cycle; // forward only: the traffic's own timers compare against this clock
  }, v);
  await page.waitForTimeout(v.wait ?? 700);
  // `until: 'yield'` (with `probe`): after `wait`, keep the clock running up to `untilMs` (default 60 s) until a vehicle
  // within the probe radius stands still for that reason, then shoot (ambient traffic is random, so a fixed wait may miss it).
  if (v.until && v.probe) {
    const found = await page.waitForFunction(({ probe: [x, z, r], why }) => ((window as any).__k3d.life?.traffic?.vehicles ?? [])
      .some((q: any) => !q.dead && q.v < 0.5 && q.why === why && Math.hypot(q.x - x, q.z - z) <= r), { probe: v.probe, why: v.until }, { timeout: v.untilMs ?? 60000, polling: 100 })
      .then(() => true, () => false);
    console.log(`  until ${v.until}: ${found ? 'seen' : 'not seen'}`);
  }
  await page.screenshot(jpeg ? { path: `${outDir}/${v.name}.jpg`, type: 'jpeg', quality: 85 } : { path: `${outDir}/${v.name}.png` });
  if (fpsMs) {
    fpsOut[v.name] = await page.evaluate((ms) => new Promise<any>((res) => { const k = (window as any).__k3d, s: number[] = []; const t0 = performance.now(); const id = setInterval(() => { s.push(k.fps); if (performance.now() - t0 >= ms) { clearInterval(id); s.sort((a, b) => a - b); res({ median: +s[s.length >> 1].toFixed(1), min: +s[0].toFixed(1), max: +s[s.length - 1].toFixed(1), n: s.length }); } }, 100); }), fpsMs);
  }
  const info = await page.evaluate(() => { const k = (window as any).__k3d; const r = k.renderer.info; return { fps: +k.fps.toFixed(1), calls: r.render.calls, tris: r.render.triangles, geo: r.memory.geometries, tex: r.memory.textures, chunks: k.world.chunks.loadedCount, pos: k.player.position.toArray().map((n: number) => +n.toFixed(1)) }; });
  console.log(v.name, JSON.stringify(info));
  if (v.probe) {
    // N2-M3: `probe: [x, z, r]` logs the vehicles within r m at the moment of the shot: how many, and why the
    // stopped ones (< 0.5 m/s) are stopped ('signal', 'yield', 'follow' = queued behind another, ...).
    const p = await page.evaluate(({ probe: [x, z, r], signal }) => {
      const t = (window as any).__k3d.life?.traffic, why: Record<string, number> = {};
      // (the probed phase at the moment of the shot: seconds into the 36 s cycle; 0-15 green, 15-17 amber, then red)
      const phase = signal && t ? +((((t.time + signal.jct * 7.3 - signal.group * 18) % 36) + 36) % 36).toFixed(1) : null;
      let near = 0, stopped = 0; const at: string[] = [];
      for (const q of t?.vehicles ?? []) {
        if (q.dead || Math.hypot(q.x - x, q.z - z) > r) continue;
        near++;
        if (q.v < 0.5) { stopped++; why[q.why || 'none'] = (why[q.why || 'none'] ?? 0) + 1; at.push(`${q.why || 'none'}@${q.x.toFixed(0)},${q.z.toFixed(0)}`); }
      }
      return { near, stopped, why, phase, at };
    }, { probe: v.probe, signal: v.signal ?? null });
    console.log('  probe', JSON.stringify(p));
  }
  if (rest.includes('--landmarks')) {
    // Triangle counts of the custom landmark meshes currently in the scene.
    const lm = await page.evaluate(() => { const out: Record<string, number> = {}; (window as any).__k3d.world.chunks.group.traverse((o: any) => { if (o.userData?.landmark) out[o.userData.landmark] = (out[o.userData.landmark] ?? 0) + o.userData.triangles; }); return out; });
    console.log('  landmarks', JSON.stringify(lm));
  }
}
if (fpsMs) { const { writeFileSync } = await import('node:fs'); writeFileSync(`${outDir}/fps.json`, JSON.stringify(fpsOut, null, 1)); console.log('fps', JSON.stringify(fpsOut)); }
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
