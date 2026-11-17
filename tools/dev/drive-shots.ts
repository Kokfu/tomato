// V8 driving prototype: a reproducible gameplay sequence with screenshots and a video.
// Usage: node tools/dev/drive-shots.ts <outDir> [--url=http://localhost:3000/] [--size=1280x720] [--mode=c] [--quality=medium] [--no-video]
//
// The sequence is played through the game's real input path: walk to the car on Jalan China, E to get in,
// drive round the block (Jalan China, Jalan Carpenter, Jalan Bishopgate, Jalan Main Bazaar, back into
// Jalan China) through four real junctions, stop, E to get out, walk away. The route is the centre line
// of the mapped OSM ways; nothing is scripted except the steering and throttle intent.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { driveRoute, carState } from '../../tests/e2e/driving-helpers.ts';
import { walk } from '../../tests/e2e/helpers.ts';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) { console.error('usage: node tools/dev/drive-shots.ts <outDir> [--url=] [--size=] [--mode=] [--quality=] [--no-video]'); process.exit(1); }
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const url = opt('url', 'http://localhost:3000/');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const mode = opt('mode', '');
const quality = opt('quality', 'medium');
const video = !rest.includes('--no-video');
mkdirSync(outDir, { recursive: true });

/** The block loop, way by way (world metres, from the chunk files). */
export const BLOCK_LOOP: [number, number][] = [
  [190.5, -27.4], [172.1, 0], [156.8, 22.9], // Jalan China (way 124545031), one-way toward Jalan Carpenter
  [176, 34], [180.2, 36.4], [183, 37.4], [256, 54.8], [264, 56.7], // Jalan Carpenter (196054157)
  [279.3, 7.7], [282.1, 0], [288.8, -17.8], // Jalan Bishopgate (124545029)
  [256, -41.5], [218.2, -68.7], // Jalan Main Bazaar (69725588)
  [205.6, -49.9], // back into Jalan China, stopping where the loop began
];

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(video ? { recordVideo: { dir: outDir, size: { width: w, height: h } } } : {}) });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement | null)?.click(), quality);
await page.evaluate(() => { const a = document.querySelector('#opt-adaptive') as HTMLInputElement | null; if (a?.checked) a.click(); });

const settle = async () => {
  await page.evaluate(() => new Promise<void>((r) => { let n = 3; const t = () => (n-- <= 0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); }));
  await page.waitForFunction(() => { const k = (window as any).__k3d, p = k.player.position; return k.world.chunks.isReady(p.x, p.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 90000 });
};
const log: Record<string, unknown>[] = [];
const shot = async (name: string, note: string) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  const car = await carState(page);
  const fps = await page.evaluate(() => Math.round((window as any).__k3d.fps));
  log.push({ shot: name, note, driving: car.active, road: car.road, kmh: Math.round(car.kmh), x: +car.x.toFixed(1), z: +car.z.toFixed(1), fps });
  console.log(`${name}: ${note} (${car.road ?? '-'}, ${Math.round(car.kmh)} km/h, ${fps} fps)`);
};
/** Take screenshots at given route distances while the car drives. */
const during = (marks: { at: number; name: string; note: string }[]) => {
  let stop = false;
  const loop = (async () => {
    const start = await carState(page);
    let last = [start.x, start.z], dist = 0;
    while (!stop && marks.length) {
      const s = await carState(page);
      dist += Math.hypot(s.x - last[0], s.z - last[1]); last = [s.x, s.z];
      if (dist >= marks[0].at) { const m = marks.shift()!; await shot(m.name, m.note); }
      else await page.waitForTimeout(60);
    }
  })();
  return async () => { stop = true; await loop; };
};

// 1. On foot at the top of Jalan China, walking down to the car.
const car0 = await carState(page);
await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, [car0.x - Math.sin(car0.heading) * 13 - Math.cos(car0.heading) * 2, car0.z - Math.cos(car0.heading) * 13 + Math.sin(car0.heading) * 2]);
await settle();
if (mode) { await page.evaluate((m) => (window as any).__k3d.v5?.setMode(m), mode); await page.waitForTimeout(4000); await settle(); }
await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 30000 });
await page.evaluate(() => { const k = (window as any).__k3d; k.tpc.yaw = k.driving.car.heading + Math.PI; k.tpc.snap(); });
await page.waitForTimeout(600);
await shot('01-walking-to-the-car', 'on foot on Jalan China, the car is marked ahead');
const side = await page.evaluate(() => { const c = (window as any).__k3d.driving.car; return [c.x - Math.cos(c.heading) * 2.2, c.z + Math.sin(c.heading) * 2.2]; }) as [number, number];
await walk(page, [side], { tolerance: 1.0, maxSeconds: 40 });
await page.waitForTimeout(500);
await shot('02-at-the-car-prompt', 'beside the driver door: the "E Drive" prompt');

// 2. Get in.
await page.keyboard.press('KeyE');
await page.waitForTimeout(900);
await shot('03-in-the-car', 'E pressed: chase camera and speedometer');

// 3. Drive round the block.
const stopShots = during([
  { at: 34, name: '04-driving-jalan-china', note: 'driving down Jalan China' },
  { at: 102, name: '05-junction-carpenter', note: 'left turn into Jalan Carpenter' },
  { at: 160, name: '06-jalan-carpenter', note: 'Jalan Carpenter' },
  { at: 220, name: '07-junction-bishopgate', note: 'left turn into Jalan Bishopgate' },
  { at: 302, name: '08-junction-main-bazaar', note: 'left turn into Jalan Main Bazaar' },
  { at: 350, name: '09-jalan-main-bazaar', note: 'Jalan Main Bazaar, along the waterfront' },
  { at: 368, name: '10-back-into-jalan-china', note: 'left turn back into Jalan China' },
]);
const drive = await driveRoute(page, BLOCK_LOOP, { speed: 9, realTime: true, maxSeconds: 150 });
await stopShots();
await page.waitForTimeout(500);
await shot('11-stopped', 'stopped on Jalan China after the loop');

// 4. Get out and walk on.
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
await shot('12-out-of-the-car', 'E pressed: on foot again beside the car');
const out = await page.evaluate(() => { const p = (window as any).__k3d.player.position; return [p.x, p.z]; }) as [number, number];
const after = await carState(page);
const walked = await walk(page, [[out[0] - Math.sin(after.heading) * 7 - Math.cos(after.heading) * 1.5, out[1] - Math.cos(after.heading) * 7 + Math.sin(after.heading) * 1.5]], { tolerance: 1.2, maxSeconds: 30 });
await page.waitForTimeout(400);
await shot('13-walking-away', 'walking away; the car stays parked');

const summary = { url, size: `${w}x${h}`, mode: mode || 'v4 (default)', quality, drive, walkedAway: walked.reached, shots: log, errors };
writeFileSync(`${outDir}/drive-sequence.json`, JSON.stringify(summary, null, 2));
// Close the page first: the recording ends with the page, and saveAs() waits until the file is complete.
const vid = page.video();
const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
await Promise.race([page.close(), timeout(15000)]);
if (vid) await Promise.race([vid.saveAs(`${outDir}/drive-sequence.webm`).then(() => vid.delete()).catch(() => {}), timeout(60000)]);
await Promise.race([browser.close(), timeout(15000)]);
console.log(JSON.stringify({ drive, walkedAway: walked.reached, errors }, null, 2));
process.exit(errors.length || !drive.reached || drive.everInBuilding || drive.everInWater ? 1 : 0);
