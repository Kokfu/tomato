// V8.3 driving feel: one fixed sequence of real key presses at the Jalan China car, with screenshots, a state log and
// (optionally) a video, so that two builds can be compared action for action.
// Usage: node tools/dev/drive-feel.ts <outDir> [--dist=dist] [--port=4183] [--size=1280x720] [--quality=medium] [--video] [--cpu=1]
// Serves the build with `vite preview` itself. Works on builds without V8.3 (lamp fields then read as null).
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) { console.error('usage: node tools/dev/drive-feel.ts <outDir> [--dist=] [--port=] [--size=] [--quality=] [--video] [--cpu=]'); process.exit(1); }
const opt = (k: string, d: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DIST = opt('dist', 'dist'), PORT = +opt('port', '4183'), QUALITY = opt('quality', 'medium'), CPU = +opt('cpu', '1');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const VIDEO = rest.includes('--video');
mkdirSync(outDir, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'pipe' });
server.stdout.resume();
server.stderr.resume();
// Ready once it answers (its console line can carry colour codes inside the port number).
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not yet */ }
  if (i > 240) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 500));
}

/** Car, camera and lamp state as the player would see it. */
function state(page: Page) {
  return page.evaluate(() => {
    const k = (window as any).__k3d, d = k.driving, car = d.car, m = d.model, cam = k.camera.position, C = k.world.collision;
    const wheel = m.wheels?.find((w: any) => w.front);
    return {
      active: d.active, fly: k.fly.active, kmh: +car.kmh.toFixed(1), vf: +car.vf.toFixed(2), x: +car.x.toFixed(2), z: +car.z.toFixed(2), heading: +car.heading.toFixed(3),
      steer: +car.steer.toFixed(3), travel: +car.travel.toFixed(2), wheelSpin: wheel ? +wheel.spin.rotation.y.toFixed(2) : null, wheelSteer: wheel ? +wheel.steer.rotation.y.toFixed(3) : null,
      brakeLamp: m.brakeLamp ? m.brakeLamp.visible : null, reverseLamp: m.reverseLamp ? m.reverseLamp.visible : null,
      bodyPitch: +m.body.rotation.z.toFixed(4), bodyRoll: +m.body.rotation.x.toFixed(4),
      camBoom: +Math.hypot(cam.x - car.x, cam.z - car.z).toFixed(2), camUp: +(cam.y - car.y).toFixed(2), camInside: C.insideBuilding(cam.x, cam.z, cam.y, false),
      camBehind: +(((cam.x - car.x) * Math.sin(car.heading) + (cam.z - car.z) * Math.cos(car.heading))).toFixed(2),
      distance: d.camera.distance, fps: Math.round(k.fps), calls: k.renderer.info.render.calls, programs: k.renderer.info.programs.length,
      lastReset: d.lastReset ? (d.lastReset.ok ? 'ok' : d.lastReset.reason) : null,
    };
  });
}

const log: Record<string, unknown>[] = [];
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(VIDEO ? { recordVideo: { dir: outDir, size: { width: W, height: H } } } : {}) });
  await ctx.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, QUALITY);
  const page = await ctx.newPage();
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const el = document.getElementById('opt-adaptive') as HTMLInputElement | null; if (el?.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
  await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
  // Stand by the driver's door (the walking part is covered by the e2e suite), settle, get in with E.
  await page.evaluate(() => { const k = (window as any).__k3d, c = k.driving.car; k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9); k.tpc.snap(); });
  await page.waitForFunction(() => { const k = (window as any).__k3d, p = k.player.position; return k.world.chunks.isReady(p.x, p.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 120_000 });
  await page.waitForTimeout(800);

  const step = async (name: string, note: string, shot = true) => {
    const s = await state(page);
    log.push({ step: name, note, ...s });
    if (shot) await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log(name.padEnd(16), note.padEnd(38), JSON.stringify(s));
  };
  const hold = async (keys: string[], ms: number) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  await step('01-enter', 'E: in the car, at rest');
  await hold(['KeyW'], 2600);
  await step('02-accelerate', 'W 2.6 s down the lane');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(250);
  await step('03-brake', 'S 0.25 s: braking from speed');
  await page.waitForTimeout(1500);
  await step('04-reverse-start', 'S held: stopped, backing off');
  await page.waitForTimeout(2600);
  await step('05-reverse', 'S held 2.6 s more: sustained reverse');
  await page.keyboard.up('KeyS');
  await hold(['KeyW'], 1200);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  await page.waitForTimeout(450);
  await step('06-steer-left', 'W+A 0.45 s: front wheels turned');
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  await hold(['Space'], 900);
  await step('07-handbrake', 'Space 0.9 s: handbrake');
  // Look-around sweep in the lane (as with the mouse): the boom at its lowest pitch and longest standard reach swings
  // over the parked rows and into the frontages. Every frame: camera inside a building / parked car, wall within 0.2 m.
  const sweep = await page.evaluate(() => new Promise<any>((resolve) => {
    const k = (window as any).__k3d, d = k.driving, car = d.car, cam = d.camera, C = k.world.collision, p = k.camera.position;
    const keep = { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, follow: cam.autoFollow };
    cam.autoFollow = false; cam.pitch = -0.08; cam.distance = 9.2;
    let frames = 0, inside = 0, nearWall = 0, minUp = 9;
    const y0 = cam.yaw;
    const tick = () => {
      // The yaw is set on the frame before it is drawn; the camera drawn now is sampled.
      if (frames > 0) {
        if (C.insideBuilding(p.x, p.z, p.y, false)) inside++;
        for (let a = 0; a < 8; a++) if (C.rayWalls(p.x, p.y, p.z, Math.cos(a * 0.785) * 0.2, 0, Math.sin(a * 0.785) * 0.2) < 1) { nearWall++; break; }
        minUp = Math.min(minUp, p.y - car.y);
      }
      if (frames++ < 360) { cam.yaw = y0 + (frames / 360) * Math.PI * 2; requestAnimationFrame(tick); }
      else { Object.assign(cam, { yaw: keep.yaw, pitch: keep.pitch, distance: keep.distance, autoFollow: keep.follow }); resolve({ frames: 360, inside, nearWall, minUp: +minUp.toFixed(2) }); }
    };
    tick();
  }));
  log.push({ step: 'sweep', ...sweep });
  console.log('sweep'.padEnd(16), '360 deg look-around, pitch -0.08, 9.2 m'.padEnd(38), JSON.stringify(sweep));
  await page.keyboard.press('KeyV'); await page.waitForTimeout(900);
  await step('08-cam-V1', 'V: next chase distance');
  await page.keyboard.press('KeyV'); await page.waitForTimeout(900);
  await step('09-cam-V2', 'V again');
  await page.keyboard.press('KeyV'); await page.waitForTimeout(900);
  await step('10-cam-V3', 'V again (back to the start)', false);
  await page.keyboard.press('KeyP'); await page.waitForTimeout(800);
  await step('11-op-mode', 'P: OP fly mode');
  await page.keyboard.press('KeyP'); await page.waitForTimeout(800);
  await step('12-op-back', 'P: back at the wheel');
  await page.keyboard.press('KeyR'); await page.waitForTimeout(800);
  await step('13-reset', 'R: back to the road');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(800);
  await step('14-exit', 'E: out of the car');
  writeFileSync(`${outDir}/log.json`, JSON.stringify({ dist: DIST, cpu: CPU, errors, log }, null, 1));
  console.log('errors:', errors.length ? errors : 'none');
  await ctx.close();
} finally {
  await browser.close();
  if (process.platform === 'win32') {
    // `npx` under a shell leaves vite in a separate tree: stop whatever listens on the port.
    const pids = new Set(execSync('netstat -ano').toString().split(/\r?\n/).filter((l) => l.includes(`:${PORT} `) && l.includes('LISTEN')).map((l) => l.trim().split(/\s+/).pop()));
    for (const pid of [server.pid, ...pids]) try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
  } else server.kill();
  process.exit(0);
}
