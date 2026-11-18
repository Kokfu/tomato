// V8.4 GPS navigation in the real game: destination panel, driving routes on the mapped road network, turn
// guidance while driving, re-planning after a missed turn, cancelling, arrival, rejection and mode changes.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { watch, start, frames } from './helpers.ts';
import { carState, placeCar, driveRoute } from './driving-helpers.ts';
import { CHINA } from '../../src/v5/geo.ts';

const SHOTS = 'docs/screenshots/gps';
/** V7 Jalan China: the lane between the parked rows into the Jalan Carpenter junction (see driving.spec.ts BLOCK_LOOP_V7). */
const CHINA_LANE: [number, number][] = ([[60, 0], [30, 0], [-4.5, 0], [-3.5, 8], [-3, 14]] as [number, number][]).map(([s, o]) => CHINA.toWorld(s, o));
/** Jalan China / Jalan Carpenter junction node (drive graph). */
const CARPENTER_JUNCTION: [number, number] = [156.7, 22.9];
/** Missed turn: the Waterfront route turns left from Jalan Carpenter into Jalan Bishopgate at (264, 56.7); carry straight on into Jalan Ewe Hai. */
const MISS_TURN: [number, number][] = [[176, 34], [180.2, 36.4], [183, 37.4], [256, 54.8], [264, 56.7], [313.1, 74.3], [361, 94.2]];

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;

interface NavInfo { active: boolean; mode?: string; target?: string; hasRoute?: boolean; length?: number; arrived?: boolean; reason?: string; routes: number; lastRouteMs: number; main: string; sub: string; hintVisible: boolean; stop?: [number, number] | null; walkAfter?: number; edgeTypes?: string[] }
const nav = (page: Page): Promise<NavInfo> => k3d(page, (k) => {
  const m = k.minimap, n = m.nav, el = document.getElementById('nav-hint')!;
  const dg = (m as any).driveGraph;
  return {
    active: !!n, mode: n?.mode, target: n?.target.id, hasRoute: !!n?.route, length: n?.route?.length, arrived: !!n?.arrivedAt, reason: n?.reason,
    routes: m.routeCount, lastRouteMs: m.lastRouteMs, main: el.querySelector('.nav-main')!.textContent!, sub: el.querySelector('.nav-sub')!.textContent!,
    hintVisible: !el.classList.contains('hidden'), stop: n?.stop ? [n.stop.x, n.stop.z] : null, walkAfter: n?.walkAfter,
    edgeTypes: n?.route && dg ? [...new Set<string>(n.route.edges.map((e: number) => dg.typeOf(e) as string))] : [],
  };
});

/** Count route-coloured (magenta #d22bd8) pixels on the minimap canvas. */
const minimapRoutePixels = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('minimap') as HTMLCanvasElement, g = c.getContext('2d')!;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 210) < 30 && d[i + 1] < 90 && Math.abs(d[i + 2] - 216) < 30) n++;
  return n;
});

/** Sample the HUD hint every 250 ms (page clock) while a drive runs. */
const startLog = (page: Page) => page.evaluate(() => {
  const w = window as any;
  w.__gpsLog = [];
  w.__gpsTimer = setInterval(() => {
    const m = w.__k3d.minimap, el = document.getElementById('nav-hint')!;
    w.__gpsLog.push({ main: el.querySelector('.nav-main')!.textContent, sub: el.querySelector('.nav-sub')!.textContent, routes: m.routeCount, arrived: !!m.nav?.arrivedAt });
  }, 250);
});
const stopLog = (page: Page): Promise<{ main: string; sub: string; routes: number; arrived: boolean }[]> => page.evaluate(() => {
  const w = window as any;
  clearInterval(w.__gpsTimer);
  return w.__gpsLog;
});
/** "640 m to …" / "1.23 km to …" -> metres. */
const metres = (s: string): number | null => {
  const m = /([\d.]+) (m|km) to /.exec(s);
  return m ? +m[1] * (m[2] === 'km' ? 1000 : 1) : null;
};

async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await start(page, { navigate: false });
  await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
}
async function getIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = (window as any).__k3d, c = k.driving.car;
    k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9);
    k.tpc.snap();
  });
  await frames(page, 3);
  await page.keyboard.press('KeyE');
  expect((await carState(page)).active).toBe(true);
}
async function openGps(page: Page): Promise<void> {
  await page.keyboard.press('KeyG');
  await expect(page.locator('#gps-panel')).toBeVisible();
  await expect(page.locator('#gps-panel .gps-item').first()).not.toHaveText(/Checking roads/, { timeout: 20_000 });
}

test.describe('V8.4 GPS navigation', () => {
  test('choose, follow, miss a turn, cancel, arrive, reject, change modes', async ({ page }) => {
    test.setTimeout(600_000);
    mkdirSync(SHOTS, { recursive: true });
    const issues = watch(page);
    await ready(page);
    const startPose = await k3d(page, (k) => ({ x: k.driving.car.x, z: k.driving.car.z, h: k.driving.car.heading }));

    // On foot there is no GPS button; at the wheel there is.
    await expect(page.locator('#gps-btn')).toBeHidden();
    await getIn(page);
    await expect(page.locator('#gps-btn')).toBeVisible();
    await expect(page.locator('#help')).toContainText('GPS');

    // 1. Destination list: five verified landmarks, each with a road distance.
    await openGps(page);
    const items = page.locator('#gps-panel .gps-item');
    await expect(items).toHaveCount(5);
    const list = await items.evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.id, text: e.textContent, disabled: (e as HTMLButtonElement).disabled })));
    for (const it of list) {
      expect(it.disabled, `${it.id} enabled`).toBe(false);
      expect(it.text).toMatch(/by road/);
    }
    await page.screenshot({ path: `${SHOTS}/gps-panel.png` });

    // 2. Pick the nearest destination: route through real junctions on drivable classes only.
    await page.locator('#gps-panel .gps-item[data-id="lau-ya-keng-food-court"]').click();
    await expect(page.locator('#gps-panel')).toBeHidden();
    let n = await nav(page);
    expect(n.mode).toBe('drive');
    expect(n.hasRoute).toBe(true);
    expect(n.length!).toBeGreaterThan(400);
    for (const t of n.edgeTypes!) expect(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']).toContain(t);
    expect(n.hintVisible).toBe(true);
    await frames(page, 30);
    n = await nav(page);
    expect(n.main).toMatch(/Turn left onto Jalan Carpenter|Drive/);
    expect(await minimapRoutePixels(page)).toBeGreaterThan(50);
    await page.screenshot({ path: `${SHOTS}/gps-route-start.png` });

    // 3./4./7. Drive the highlighted route (the V7 lane on Jalan China, then the route's own road geometry).
    const routePts = await k3d(page, (k) => k.minimap.nav.route.points as number[]);
    let j = 0, best = Infinity;
    for (let i = 0; i < routePts.length; i += 2) {
      const d = Math.hypot(routePts[i] - CARPENTER_JUNCTION[0], routePts[i + 1] - CARPENTER_JUNCTION[1]);
      if (d < best) { best = d; j = i; }
    }
    const path: [number, number][] = [...CHINA_LANE];
    for (let i = j + 2; i < routePts.length; i += 2) path.push([routePts[i], routePts[i + 1]]);
    const routesBefore = n.routes;
    await startLog(page);
    const drive = await driveRoute(page, path, { speed: 8, speedup: 2, maxSeconds: 260, tolerance: 5 });
    await frames(page, 40);
    const log = await stopLog(page);
    expect(drive.reached, JSON.stringify({ x: drive.x, z: drive.z })).toBe(true);
    expect(drive.everInBuilding).toBe(false);
    n = await nav(page);
    expect(n.arrived, n.main).toBe(true);
    expect(n.main).toContain('Arrived: Lau Ya Keng Food Court');
    // Remaining distance went down as the car moved (sampled from the HUD), with turn instructions on the way.
    const rem = log.map((e) => metres(e.sub)).filter((v): v is number => v !== null);
    expect(rem.length).toBeGreaterThan(10);
    expect(rem[rem.length - 1]).toBeLessThan(rem[0] - 300);
    let rises = 0;
    for (let i = 1; i < rem.length; i++) if (rem[i] > rem[i - 1] + 15) rises++;
    expect(rises).toBeLessThanOrEqual(1);
    const instr = [...new Set(log.map((e) => e.main))];
    expect(instr.some((s) => /Turn left onto Jalan Bishopgate/.test(s))).toBe(true);
    expect(instr.some((s) => /Turn left onto Jalan Main Bazaar/.test(s))).toBe(true);
    // Following the route needs no re-planning.
    expect(n.routes - routesBefore).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/gps-arrived.png` });
    // Completed route on the full map.
    await page.keyboard.press('KeyM');
    await page.evaluate(() => { const m = (window as any).__k3d.minimap; if (m.nav?.route) m.fitRoute(m.nav.route); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/gps-completed-route-map.png` });
    await page.keyboard.press('KeyM');

    // 5. Missed turn: back at the start (test set-up), route to the Waterfront, carry straight on into Jalan Ewe Hai.
    await placeCar(page, startPose.x, startPose.z, startPose.h);
    await frames(page, 5);
    await k3d(page, (k) => k.minimap.routeTo('waterfront', 'drive'));
    n = await nav(page);
    expect(n.hasRoute).toBe(true);
    const r0 = n.routes, len0 = n.length!;
    await startLog(page);
    const miss = await driveRoute(page, [...CHINA_LANE, ...MISS_TURN], { speed: 8, speedup: 2, maxSeconds: 200, tolerance: 5 });
    await frames(page, 60);
    const missLog = await stopLog(page);
    expect(miss.reached).toBe(true);
    n = await nav(page);
    expect(n.routes, 're-planned after the missed turn').toBeGreaterThan(r0);
    expect(n.hasRoute).toBe(true);
    expect(n.main).not.toContain('Return to the highlighted route');
    expect(missLog.some((e) => e.routes > r0)).toBe(true);
    const off = await k3d(page, (k) => {
      const r = k.minimap.nav.route, p = k.player.position;
      let best = Infinity;
      for (let i = 0; i < r.points.length; i += 2) best = Math.min(best, Math.hypot(r.points[i] - p.x, r.points[i + 1] - p.z));
      return best;
    });
    expect(off).toBeLessThan(20);
    expect(n.length).not.toBe(len0);
    await page.screenshot({ path: `${SHOTS}/gps-rerouted.png` });

    // 6. Cancel: X key, then via the GPS panel.
    await page.keyboard.press('KeyX');
    n = await nav(page);
    expect(n.active).toBe(false);
    await expect(page.locator('#nav-hint')).toBeHidden();
    await openGps(page);
    await page.locator('#gps-panel .gps-item[data-id="main-bazaar"]').click();
    expect((await nav(page)).active).toBe(true);
    await openGps(page);
    await page.locator('#gps-panel .gps-cancel').click();
    expect((await nav(page)).active).toBe(false);
    await expect(page.locator('#gps-panel')).toBeHidden();

    // 9. OP mode and walking: GPS hides in OP mode and the route survives; getting out turns it into a walking route, getting in back into a drive.
    await k3d(page, (k) => k.minimap.routeTo('waterfront', 'drive'));
    await page.keyboard.press('KeyP');
    await expect.poll(() => k3d(page, (k) => k.fly.active)).toBe(true);
    await expect(page.locator('#gps-btn')).toBeHidden();
    await page.keyboard.press('KeyG'); // G is OP mode's eye lock: the GPS must not open
    await expect(page.locator('#gps-panel')).toBeHidden();
    await page.keyboard.press('KeyP');
    await expect.poll(() => k3d(page, (k) => k.fly.active)).toBe(false);
    expect((await nav(page)).mode).toBe('drive');
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await nav(page)).mode).toBe('walk');
    expect((await carState(page)).active).toBe(false);
    await expect(page.locator('#gps-btn')).toBeHidden();
    await getIn(page);
    await expect.poll(async () => (await nav(page)).mode).toBe('drive');
    expect((await nav(page)).hasRoute).toBe(true);
    await page.keyboard.press('KeyX');

    // 8. Rejection: with the car off the mapped carriageways (an open spot > 40 m from any drivable centre line),
    // every destination is unavailable and a route request says why instead of drawing a line.
    const spot = await k3d(page, (k) => {
      const c = k.world.collision, ch = k.world.chunks, dg = (k.minimap as any).driveGraph, p = k.player.position;
      for (let r = 40; r < 700; r += 8) for (let a = 0; a < 64; a++) {
        const x = p.x + Math.cos((a / 64) * Math.PI * 2) * r, z = p.z + Math.sin((a / 64) * Math.PI * 2) * r;
        if (!c.isLoaded(x, z) || !ch.isReady(x, z) || c.inWater(x, z)) continue;
        const y = c.groundAt(x, z, 1e6).h;
        if (c.insideBuilding(x, z, y + 0.5, false) || c.boxContact(x, z, 0, 1, 2.6, 1.3, y)) continue;
        if (dg.snap(x, z, 45).length) continue;
        return [x, z];
      }
      return null;
    });
    expect(spot, 'an open spot away from the roads').not.toBeNull();
    await placeCar(page, spot![0], spot![1], 0);
    await frames(page, 10);
    await openGps(page);
    const rej = await items.evaluateAll((els) => els.map((e) => ({ text: e.textContent, disabled: (e as HTMLButtonElement).disabled })));
    for (const it of rej) {
      expect(it.disabled).toBe(true);
      expect(it.text).toMatch(/Drive onto a mapped road/);
    }
    await page.screenshot({ path: `${SHOTS}/gps-unavailable.png` });
    await page.keyboard.press('KeyG');
    await k3d(page, (k) => k.minimap.routeTo('waterfront', 'drive'));
    await frames(page, 30);
    n = await nav(page);
    expect(n.hasRoute).toBe(false);
    expect(n.reason).toMatch(/Drive onto a mapped road/);
    expect(n.main).toContain('no driving route');
    expect(await minimapRoutePixels(page)).toBe(0);
    await page.keyboard.press('KeyX');

    // 10. Route planning cost (whole-area graph, no chunk loading needed).
    expect(n.lastRouteMs).toBeLessThan(50);
    expect(issues.errors).toEqual([]);
  });
});
