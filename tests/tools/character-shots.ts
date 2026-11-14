// Dev utility: screenshots and foot-slide measurements of the player character in the running app.
// Usage: node tests/tools/character-shots.ts <outDir> [--url=http://localhost:5183/] [--quality=medium]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir = 'docs/screenshots/character', ...rest] = process.argv.slice(2);
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const url = opt('url', 'http://localhost:5183/');
const quality = opt('quality', 'medium');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
const log: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
const requests: string[] = [];
page.on('response', (r) => { if (/\.glb|GLTFLoader|GlbCharacter/.test(r.url())) requests.push(`${r.status()} ${r.url()}`); });

// --fail-model: serve a 404 for the model to check that the procedural humanoid stays in use.
if (rest.includes('--fail-model')) await page.route('**/*.glb', (r) => r.fulfill({ status: 404, body: 'not found' }));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 60000 });
await page.click('#btn-start');
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement | null)?.click(), quality);
const glb = await page.waitForFunction(() => !!(window as any).__k3d.player.visual.mixer, null, { timeout: 15000 }).then(() => true, () => false);
console.log('GLB character active:', glb);
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 }).catch(() => log.push('chunk load timeout'));

type Cmd = { x?: number; y?: number; run?: boolean; yaw?: number; pitch?: number; dist?: number; reset?: boolean; jump?: boolean; fp?: boolean };
const set = (c: Cmd) => page.evaluate((c) => {
  const k = (window as any).__k3d;
  if (c.reset) { const s = k.world.manifest.spawn; k.player.teleport(s.x, s.z); k.player.heading = Math.PI; }
  if (c.yaw !== undefined) k.tpc.yaw = c.yaw;
  if (c.pitch !== undefined) k.tpc.pitch = c.pitch;
  if (c.dist !== undefined) k.tpc.distance = c.dist;
  if (c.fp !== undefined && k.tpc.firstPerson !== c.fp) { k.tpc.firstPerson = c.fp; k.player.visual.root.visible = !c.fp; }
  k.input.touchX = c.x ?? 0;
  k.input.touchY = c.y ?? 0;
  k.input.touchRun = !!c.run;
  if (c.jump) k.input.jump = true;
}, c);
const shot = async (name: string) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  const s = await page.evaluate(() => { const p = (window as any).__k3d.player; return `speed ${p.speed.toFixed(2)} grounded ${p.grounded} y ${p.position.y.toFixed(2)}`; });
  console.log(name, s);
};
/** Horizontal world-space speed of the feet while planted, sampled over `ms` of movement. */
const footSlide = (ms: number) => page.evaluate((ms) => new Promise<string>((resolve) => {
  const k = (window as any).__k3d;
  const feet: any[] = [];
  k.player.visual.root.traverse((o: any) => { if (o.isBone && /foot/i.test(o.name)) feet.push(o); });
  if (feet.length < 2) return resolve('no foot bones (procedural humanoid?)');
  const V = feet[0].position.constructor;
  const rec: { t: number; p: any[] }[] = [];
  const t0 = performance.now();
  const tick = () => {
    const t = performance.now();
    rec.push({ t, p: feet.map((f) => f.getWorldPosition(new V())) });
    if (t - t0 < ms) return requestAnimationFrame(tick);
    let slide = 0, n = 0;
    for (let f = 0; f < feet.length; f++) {
      const ys = rec.map((r) => r.p[f].y - k.player.position.y);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      for (let i = 1; i < rec.length; i++) {
        if (rec[i].p[f].y - k.player.position.y > lo + (hi - lo) * 0.12) continue;
        const dt = (rec[i].t - rec[i - 1].t) / 1000;
        if (dt <= 0) continue;
        slide += Math.hypot(rec[i].p[f].x - rec[i - 1].p[f].x, rec[i].p[f].z - rec[i - 1].p[f].z) / dt;
        n++;
      }
    }
    resolve(`player ${k.player.speed.toFixed(2)} m/s, planted-foot drift ${(slide / Math.max(1, n)).toFixed(2)} m/s over ${n} samples`);
  };
  requestAnimationFrame(tick);
}), ms);

const info = await page.evaluate(() => {
  const v = (window as any).__k3d.player.visual;
  if (!v.mixer) return null;
  const box = { min: Infinity, max: -Infinity };
  v.root.updateMatrixWorld(true);
  v.root.traverse((o: any) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); box.min = Math.min(box.min, b.min.y); box.max = Math.max(box.max, b.max.y); } });
  return { walk: v.walkGait, run: v.runGait, airTime: v.airTime, feetY: +(box.min - v.root.position.y).toFixed(3), headY: +(box.max - v.root.position.y).toFixed(3) };
});
console.log('gait', JSON.stringify(info));

const SIDE = { yaw: 0, pitch: 0.08, dist: 3.4 };
await set({ reset: true, ...SIDE });
await page.waitForTimeout(600);
await shot('idle-rear');
await set({ yaw: Math.PI, pitch: 0.08, dist: 3.0 });
await page.waitForTimeout(400);
await shot('idle-front');
await set({ yaw: Math.PI / 2, pitch: 0.08, dist: 3.0 });
await page.waitForTimeout(400);
await shot('idle-side');

// Walk: side view (strafing relative to the camera puts the character in profile), then rear view.
await set({ reset: true, ...SIDE, x: 1 });
await page.waitForTimeout(900);
for (let i = 0; i < 4; i++) { await shot(`walk-side-${i + 1}`); await page.waitForTimeout(170); }
console.log('walk', await footSlide(2000));
await set({ reset: true, ...SIDE, y: 1 });
await page.waitForTimeout(900);
await shot('walk-rear');

// Run.
await set({ reset: true, ...SIDE, x: 1, run: true });
await page.waitForTimeout(800);
for (let i = 0; i < 4; i++) { await shot(`run-side-${i + 1}`); await page.waitForTimeout(110); }
await set({ reset: true, ...SIDE, x: 1, run: true });
await page.waitForTimeout(500);
console.log('run', await footSlide(1000));
await set({ reset: true, ...SIDE, y: 1, run: true });
await page.waitForTimeout(700);
await shot('run-rear');

// Turning: walk away from the camera, then reverse direction and catch the turn.
await set({ reset: true, ...SIDE, y: 1 });
await page.waitForTimeout(700);
await set({ ...SIDE, x: -1 });
await page.waitForTimeout(90);
await shot('turn-1');
await page.waitForTimeout(120);
await shot('turn-2');

// Jump: standing and running.
// The jump lasts about half a second, so it is shot in slow motion (fixed 1/600 s steps).
const slowMo = (on: boolean) => page.evaluate((on) => (window as any).__k3d.setSimulatedDt(on ? 1 / 600 : 0), on);
const untilVy = async (below: number) => {
  if (below > 0) await page.waitForFunction(() => !(window as any).__k3d.player.grounded);
  await page.waitForFunction((b) => { const p = (window as any).__k3d.player; return p.grounded || p.velocity.y < b; }, below);
};
await set({ reset: true, ...SIDE });
await page.waitForTimeout(500);
await slowMo(true);
await set({ ...SIDE, jump: true });
await untilVy(3.5);
await shot('jump-stand-rise');
await untilVy(0.3);
await shot('jump-stand-apex');
await untilVy(-3.5);
await shot('jump-stand-fall');
await slowMo(false);
await page.waitForTimeout(500);
await shot('jump-stand-landed');
await set({ reset: true, ...SIDE, x: 1, run: true });
await page.waitForTimeout(700);
await slowMo(true);
await set({ ...SIDE, x: 1, run: true, jump: true });
await untilVy(0.3);
await shot('jump-run-apex');
await slowMo(false);
await page.waitForTimeout(600);
await shot('jump-run-landed');

// First person: the character must be hidden.
await set({ reset: true, ...SIDE, fp: true });
await page.waitForTimeout(400);
await shot('first-person');
await set({ fp: false });

console.log('REQUESTS:', requests.join('\n'));
if (log.length) console.log('CONSOLE:', [...new Set(log)].slice(0, 20).join('\n'));
await browser.close();
