// Capture screenshots of the running app at given views (dev utility, also used for docs).
// Usage: node tools/dev/shots.ts <outDir> '<json views>' [--url=http://localhost:3000/] [--size=1280x720] [--mobile]
//        [--quality=low|medium|high] [--jpeg] [--fps[=ms]]  (--fps: sample __k3d.fps for 5 s per view, writes <outDir>/fps.json)
//        [--time=<hour 0..24>|day|evening|night] [--rain=<0..1>]  (N1-M6: the clock is stopped there; default a dry day at 09:40)
// A view: { name, lm?: landmarkId, lat?, lon?, yaw?, pitch?, dist?, fp?: boolean, map?: boolean, wait?: ms, time?, rain? }
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
  await page.waitForTimeout(v.wait ?? 700);
  await page.screenshot(jpeg ? { path: `${outDir}/${v.name}.jpg`, type: 'jpeg', quality: 85 } : { path: `${outDir}/${v.name}.png` });
  if (fpsMs) {
    fpsOut[v.name] = await page.evaluate((ms) => new Promise<any>((res) => { const k = (window as any).__k3d, s: number[] = []; const t0 = performance.now(); const id = setInterval(() => { s.push(k.fps); if (performance.now() - t0 >= ms) { clearInterval(id); s.sort((a, b) => a - b); res({ median: +s[s.length >> 1].toFixed(1), min: +s[0].toFixed(1), max: +s[s.length - 1].toFixed(1), n: s.length }); } }, 100); }), fpsMs);
  }
  const info = await page.evaluate(() => { const k = (window as any).__k3d; const r = k.renderer.info; return { fps: +k.fps.toFixed(1), calls: r.render.calls, tris: r.render.triangles, geo: r.memory.geometries, tex: r.memory.textures, chunks: k.world.chunks.loadedCount, pos: k.player.position.toArray().map((n: number) => +n.toFixed(1)) }; });
  console.log(v.name, JSON.stringify(info));
  if (rest.includes('--landmarks')) {
    // Triangle counts of the custom landmark meshes currently in the scene.
    const lm = await page.evaluate(() => { const out: Record<string, number> = {}; (window as any).__k3d.world.chunks.group.traverse((o: any) => { if (o.userData?.landmark) out[o.userData.landmark] = (out[o.userData.landmark] ?? 0) + o.userData.triangles; }); return out; });
    console.log('  landmarks', JSON.stringify(lm));
  }
}
if (fpsMs) { const { writeFileSync } = await import('node:fs'); writeFileSync(`${outDir}/fps.json`, JSON.stringify(fpsOut, null, 1)); console.log('fps', JSON.stringify(fpsOut)); }
if (errors.length) console.log('CONSOLE:', [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
