// N1-M7: look at the play loop. Starts the game, lists the parked vehicles round the start, saves a close-up of the
// nearest one of each kind, then (with --job) gets into the car, opens the phone and saves its screens.
// Usage: node tools/dev/play-probe.ts <outDir> [--url=http://localhost:5175/] [--mobile] [--quality=medium] [--job] [--x= --z=]
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
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
const q = opt('quality', '');
if (q) await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement).click(), q);
await page.waitForFunction(() => { const l = (window as any).__k3d.life; return l && l.active; }, null, { timeout: 30000 });
const x = opt('x', ''), z = opt('z', '');
if (x && z) await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, [+x, +z]);
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 60000 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const k = (window as any).__k3d, p = k.player.position, c = k.driving.car, pl = k.play;
  const list = pl.parked.map((q: any) => ({ kind: q.drive, x: +q.x.toFixed(1), z: +q.z.toFixed(1), key: q.key, d: Math.round(Math.hypot(q.x - p.x, q.z - p.z)), dCar: Math.round(Math.hypot(q.x - c.x, q.z - c.z)) }));
  list.sort((a: any, b: any) => a.dCar - b.dCar);
  const kinds: Record<string, number> = {};
  for (const q of list) kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
  return { player: [+p.x.toFixed(1), +p.z.toFixed(1)], car: [+c.x.toFixed(1), +c.z.toFixed(1)], count: list.length, kinds, nearest: list.slice(0, 16), calls: k.renderer.info.render.calls, tris: k.renderer.info.render.triangles, programs: k.renderer.info.programs.length };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: `${outDir}/start.jpg`, type: 'jpeg', quality: 85 });
// a close-up of the nearest parked vehicle of each kind: stand the walker 5 m off, looking at it
for (const kind of ['hatch', 'kapcai', 'taxi', 'pickup']) {
  const ok = await page.evaluate((kind) => {
    const k = (window as any).__k3d, c = k.driving.car;
    const list = k.play.parked.filter((q: any) => q.drive === kind).sort((a: any, b: any) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    const col = k.world.collision;
    for (const q of list.slice(0, 4)) {
      for (const [u, v] of [[1.5, 4.2], [1.5, -4.2], [-1.5, 4.2], [-1.5, -4.2], [5, 2], [-5, 2]]) {
        const hx = Math.sin(q.heading), hz = Math.cos(q.heading), x = q.x + hx * u + hz * v, z = q.z + hz * u - hx * v;
        if (!col.isLoaded(x, z) || col.inWater(x, z) || col.insideBuilding(x, z, q.y + 0.5)) continue;
        k.player.teleport(x, z);
        k.player.heading = Math.atan2(q.x - x, q.z - z);
        k.tpc.yaw = k.player.heading - Math.PI; k.tpc.pitch = 0.18; k.tpc.snap();
        return true;
      }
    }
    return false;
  }, kind);
  if (!ok) { console.log('no', kind, 'to look at'); continue; }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/parked-${kind}.jpg`, type: 'jpeg', quality: 85 });
  const prompt = await page.evaluate(() => ({ near: (window as any).__k3d.play.near?.drive ?? null, prompt: document.getElementById('car-prompt')!.textContent, hidden: document.getElementById('car-prompt')!.classList.contains('hidden') }));
  console.log(kind, JSON.stringify(prompt));
}
if (rest.includes('--job')) {
  await page.evaluate(() => { const k = (window as any).__k3d, c = k.driving.car; k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9); k.tpc.snap(); });
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/in-car.jpg`, type: 'jpeg', quality: 85 });
  await page.click('#btn-phone');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/phone-home.jpg`, type: 'jpeg', quality: 85 });
  await page.click('#ph-delivery');
  await page.waitForSelector('.ph-offer', { timeout: 20000 });
  await page.screenshot({ path: `${outDir}/phone-offers.jpg`, type: 'jpeg', quality: 85 });
  console.log(JSON.stringify(await page.evaluate(() => (window as any).__k3d.play.offersShown.map((o: any) => ({ from: o.from, to: o.to, approach: Math.round(o.approach), trip: Math.round(o.trip), fare: o.fare })))));
  await page.click('.ph-offer');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/job.jpg`, type: 'jpeg', quality: 85 });
  console.log(JSON.stringify(await page.evaluate(() => { const k = (window as any).__k3d, n = k.minimap.nav; return { job: k.play.job?.stage, nav: n && { name: n.target.name, len: n.route?.length, stop: n.stop, reason: n.reason }, wallet: document.getElementById('wallet')!.textContent }; })));
}
if (errors.length) console.log('ERRORS\n' + errors.slice(0, 20).join('\n'));
await browser.close();
