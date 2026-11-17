// V8 first driving prototype: one drivable car on the real Kuching road data.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { watch, start, state, frames, walk, waitChunks, chainOfWays, manifest } from './helpers.ts';
import { carState, placeCar, driveRoute, waysNamed, pathLength } from './driving-helpers.ts';
import { CAR_START } from '../../src/vehicle/VehiclePhysics.ts';
import { CHINA } from '../../src/v5/geo.ts';

const HALF_LEN = 1.95, HALF_WID = 0.865;
/** The block loop from the car's kerb: Jalan China, Jalan Carpenter, Jalan Bishopgate, Jalan Main Bazaar, Jalan China. */
const BLOCK_LOOP: [number, number][] = [
  [190.5, -27.4], [172.1, 0], [156.8, 22.9], [176, 34], [180.2, 36.4], [183, 37.4], [256, 54.8], [264, 56.7],
  [279.3, 7.7], [282.1, 0], [288.8, -17.8], [256, -41.5], [218.2, -68.7], [205.6, -49.9],
];

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const ready = async (page: Page) => {
  await start(page);
  await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
};
/** Stand the character at the driver's door (the right side) of the car. */
const toDoor = async (page: Page) => {
  await page.evaluate(() => {
    const k = (window as any).__k3d, c = k.driving.car;
    k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9);
    k.tpc.snap();
  });
  await frames(page, 3);
};
const getIn = async (page: Page) => {
  await toDoor(page);
  await page.keyboard.press('KeyE');
  expect((await carState(page)).active).toBe(true);
};
/** Hold keys for n frames while watching the car every frame. */
const hold = async (page: Page, codes: string[], n: number) => {
  for (const c of codes) await page.keyboard.down(c);
  const seen = await page.evaluate((n) => new Promise<{ everInBuilding: boolean; everInWater: boolean; maxImpact: number; blocked: string[]; maxKmh: number }>((resolve) => {
    const k = (window as any).__k3d, car = k.driving.car, c = k.world.collision;
    const res = { everInBuilding: false, everInWater: false, maxImpact: 0, blocked: [] as string[], maxKmh: 0 };
    const tick = () => {
      const f = car.footprint(-0.05);
      for (let i = 0; i < 8; i += 2) {
        if (c.insideBuilding(f[i], f[i + 1], car.y, false)) res.everInBuilding = true;
        if (c.inWater(f[i], f[i + 1]) && !car.onDeck) res.everInWater = true;
      }
      res.maxImpact = Math.max(res.maxImpact, car.impact);
      res.maxKmh = Math.max(res.maxKmh, car.kmh);
      if (car.blocked && !res.blocked.includes(car.blocked)) res.blocked.push(car.blocked);
      if (n-- <= 0) resolve(res); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  for (const c of codes) await page.keyboard.up(c);
  return seen;
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

test.describe('V8 driving prototype', () => {
  test('walk to the car, E to get in, drive forward, brake, reverse, stop, E to get out, walk on', async ({ page }) => {
    const issues = watch(page);
    await ready(page);
    const parked = await carState(page);
    expect(parked.road).toBe('Jalan China');
    expect(parked.onRoad).toBe(true);
    expect(parked.inBuilding).toBe(false);
    expect(Math.abs(parked.y - parked.ground)).toBeLessThan(0.15);
    await expect(page.locator('#speedo')).toBeHidden();
    await expect(page.locator('#car-prompt')).toBeHidden();

    // Walk down the street to the car. It is a solid obstacle: walking at its middle stops at the body.
    const fwd = [Math.sin(parked.heading), Math.cos(parked.heading)], left = [Math.cos(parked.heading), -Math.sin(parked.heading)];
    await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, [parked.x - fwd[0] * 12 - left[0] * 2.2, parked.z - fwd[1] * 12 - left[1] * 2.2]);
    await waitChunks(page);
    expect(await k3d(page, (k) => k.driving.canEnter(k.player))).toBe(false);
    const bump = await walk(page, [[parked.x, parked.z]], { tolerance: 0.5, maxSeconds: 12 });
    expect(bump.reached).toBe(false);
    const u = (bump.x - parked.x) * fwd[0] + (bump.z - parked.z) * fwd[1], v = (bump.x - parked.x) * left[0] + (bump.z - parked.z) * left[1];
    expect(Math.abs(u) >= HALF_LEN + 0.3 || Math.abs(v) >= HALF_WID + 0.3, `walker stopped outside the body (${u.toFixed(2)}, ${v.toFixed(2)})`).toBe(true);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    await frames(page, 3);
    await expect(page.locator('#car-prompt')).toBeVisible();
    await expect(page.locator('#car-prompt')).toContainText('Drive');

    // E: in the car.
    await page.keyboard.press('KeyE');
    let s = await carState(page);
    expect(s.active).toBe(true);
    await expect(page.locator('#speedo')).toBeVisible();
    await expect(page.locator('#car-prompt')).toBeHidden();
    await expect(page.locator('#help')).toContainText('handbrake');
    expect(await k3d(page, (k) => k.player.visual.root.visible)).toBe(false);
    expect(await k3d(page, (k) => k.placePanel && document.getElementById('place-panel')!.classList.contains('hidden'))).toBe(true);

    // W: forward along Jalan China.
    await hold(page, ['KeyW'], 120);
    const a = await carState(page);
    const along = (a.x - parked.x) * fwd[0] + (a.z - parked.z) * fwd[1];
    expect(a.vf).toBeGreaterThan(6);
    expect(along).toBeGreaterThan(7);
    await frames(page, 20); // the HUD refreshes four times a second
    expect(Number(await page.locator('#speedo-kmh').textContent())).toBeGreaterThan(15);
    await expect(page.locator('#speedo-gear')).toHaveText('D');
    // The character rides along: the map, the location read-out and the streaming follow the car.
    expect(await k3d(page, (k) => Math.hypot(k.player.position.x - k.driving.car.x, k.player.position.z - k.driving.car.z))).toBeLessThan(0.5);
    expect(await k3d(page, (k) => k.world.chunks.nearestRoadName(k.player.position.x, k.player.position.z))).toBe('Jalan China');

    // E while moving is refused.
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#toast')).toContainText('Stop the car');

    // S: brake to a stop, then reverse.
    await hold(page, ['KeyS'], 45);
    expect(Math.abs((await carState(page)).vf)).toBeLessThan(1.6);
    await hold(page, ['KeyS'], 90);
    const r = await carState(page);
    expect(r.vf).toBeLessThan(-2);
    await frames(page, 20);
    await expect(page.locator('#speedo-gear')).toHaveText('R');
    // W brakes the reversing car; then it is left to stand.
    await hold(page, ['KeyW'], 14);
    await hold(page, ['Space'], 60);
    s = await carState(page);
    expect(Math.abs(s.vf)).toBeLessThan(0.1);
    expect(s.inBuilding).toBe(false);

    // E: out, beside the car, walking as before.
    await page.keyboard.press('KeyE');
    s = await carState(page);
    expect(s.active).toBe(false);
    await expect(page.locator('#speedo')).toBeHidden();
    expect(await k3d(page, (k) => k.player.visual.root.visible)).toBe(true);
    await expect(page.locator('#help')).toContainText('jump');
    const foot = await state(page);
    expect(foot.inBuilding).toBe(false);
    expect(foot.inWater).toBe(false);
    const d = Math.hypot(foot.x - s.x, foot.z - s.z);
    expect(d).toBeGreaterThan(HALF_WID + 0.3);
    expect(d).toBeLessThan(HALF_LEN + 1.6);
    const away = await walk(page, [[foot.x - fwd[0] * 6 - left[0] * 1.5, foot.z - fwd[1] * 6 - left[1] * 1.5]], { tolerance: 1, maxSeconds: 20 });
    expect(away.reached).toBe(true);
    expect(away.everInBuilding).toBe(false);
    // The car stayed where it was left, and can be entered again.
    const still = await carState(page);
    expect(Math.hypot(still.x - s.x, still.z - s.z)).toBeLessThan(0.01);
    await getIn(page);
    expect(issues.errors).toEqual([]);
  });

  test('steering, handbrake, off-road note and R back to the road', async ({ page }) => {
    const issues = watch(page);
    await ready(page);
    const turn = async (key: string) => {
      await placeCar(page, 181.5, -14.1, -0.588); // middle of Jalan China
      await getIn(page);
      await hold(page, ['KeyW'], 50);
      const before = await carState(page);
      const seen = await hold(page, ['KeyW', key], 36);
      const after = await carState(page);
      await hold(page, ['Space'], 70);
      await page.keyboard.press('KeyE');
      expect(seen.everInBuilding).toBe(false);
      return { d: wrap(after.heading - before.heading), steer: after.steer };
    };
    const l = await turn('KeyA'), r = await turn('KeyD');
    expect(l.d).toBeGreaterThan(0.2); // heading increases toward the left
    expect(r.d).toBeLessThan(-0.2);
    expect(Math.abs(l.d + r.d)).toBeLessThan(0.3); // exact symmetry is a unit test; here key timing varies by a few frames
    expect(l.steer).toBeGreaterThan(0.1);
    expect(r.steer).toBeLessThan(-0.1);

    // Handbrake: stops in a much shorter distance than coasting.
    const stopDist = async (key: string | null) => {
      await placeCar(page, 195.4, -34.9, -0.588);
      await getIn(page);
      await hold(page, ['KeyW'], 70);
      const a = await carState(page);
      if (key) await hold(page, [key], 80); else await frames(page, 80);
      const b = await carState(page);
      await hold(page, ['Space'], 90);
      await page.keyboard.press('KeyE');
      return { dist: Math.hypot(b.x - a.x, b.z - a.z), vf: b.vf };
    };
    const coast = await stopDist(null), hand = await stopDist('Space');
    expect(hand.vf).toBeLessThan(0.1);
    expect(coast.vf).toBeGreaterThan(3);
    expect(hand.dist).toBeLessThan(coast.dist * 0.75);

    // R: from wherever the car ended up (here: the riverside promenade, off any carriageway) back to the road.
    await placeCar(page, 181.5, -14.1, -0.588);
    await getIn(page);
    await hold(page, ['KeyW'], 80);
    await hold(page, ['Space'], 70);
    const on = await k3d(page, (k) => ({ ...k.driving.car.lastRoad }));
    expect(on.x).toBeDefined();
    const sp = manifest.spawn;
    await page.evaluate(([x, z]) => { const d = (window as any).__k3d.driving; d.car.place(x, z, 1.2); d.camera.snap(d.car); }, [sp.x, sp.z]);
    await waitChunks(page);
    await frames(page, 30);
    let s = await carState(page);
    expect(s.onRoad).toBe(false);
    await expect(page.locator('#speedo-note')).toHaveText('OFF ROAD');
    await page.keyboard.press('KeyR');
    await frames(page, 30);
    s = await carState(page);
    expect(Math.hypot(s.x - on.x, s.z - on.z)).toBeLessThan(0.01);
    expect(wrap(s.heading - on.heading)).toBeCloseTo(0, 5);
    expect(s.onRoad).toBe(true);
    expect(s.road).toBe('Jalan China');
    expect(s.vf).toBe(0);
    await expect(page.locator('#speedo-note')).toHaveText('');
    expect(issues.errors).toEqual([]);
  });

  test('collisions: a shophouse wall, a parked car and the river stop the car', async ({ page }) => {
    const issues = watch(page);
    await ready(page);

    // 1. Straight at the shophouse row on Jalan China.
    await placeCar(page, 181.5, -14.1, -0.588 + Math.PI / 2);
    await getIn(page);
    const wall = await hold(page, ['KeyW'], 200);
    let s = await carState(page);
    expect(wall.everInBuilding).toBe(false);
    expect(wall.maxImpact).toBeGreaterThan(2);
    expect(Math.abs(s.vf)).toBeLessThan(0.6);
    expect(Math.hypot(s.x - 181.5, s.z + 14.1)).toBeLessThan(9); // did not pass through the row
    expect(Math.abs(s.y - s.ground)).toBeLessThan(0.6);
    // It can reverse out again.
    await hold(page, ['KeyS'], 70);
    expect((await carState(page)).vf).toBeLessThan(-1);
    await hold(page, ['Space'], 60);
    await page.keyboard.press('KeyE');

    // 2. Into the back of a parked car on Jalan Main Bazaar.
    await page.evaluate(() => { const k = (window as any).__k3d; k.player.teleport(245, -50); });
    await waitChunks(page);
    // Parked cars stand nose to tail along the kerb: pick one whose flank can be driven at across the carriageway.
    const found = await k3d(page, (k) => {
      const c = k.world.collision, car = k.driving.car, out: { x: number; z: number; tx: number; tz: number; half: number }[] = [];
      c.forNearWalls(245, -50, 60, (w: any) => {
        const r = w.rings[0];
        if (r.length !== 8 || w.dressOf !== undefined) return;
        const a = Math.hypot(r[2] - r[0], r[3] - r[1]), b = Math.hypot(r[4] - r[2], r[5] - r[3]);
        const long = Math.max(a, b), short = Math.min(a, b), cx = (r[0] + r[4]) / 2, cz = (r[1] + r[5]) / 2;
        const h = w.top - k.world.height.sample(r[0], r[1]);
        if (Math.abs(h - 1.5) > 0.05 || long < 4 || long > 5.2 || short < 1.7 || short > 1.9) return;
        const [ex, ez] = a > b ? [r[2] - r[0], r[3] - r[1]] : [r[4] - r[2], r[5] - r[3]];
        out.push({ x: cx, z: cz, tx: ex / long, tz: ez / long, half: short / 2 });
      });
      for (const t of out) for (const sg of [1, -1]) for (const d of [4.4, 5, 5.6]) {
        const nx = t.tz * sg, nz = -t.tx * sg, x = t.x + nx * d, z = t.z + nz * d, h = Math.atan2(-nx, -nz);
        // On the carriageway side only (not from inside the five-foot way).
        const road = car.env.road(x, z);
        if (!road || road.dist > road.width / 2 + 1.5) continue;
        if (car.canOccupy(x, z, h, k.world.height.sample(x, z))) return { parked: out.length, target: t, from: { x, z, h } };
      }
      return { parked: out.length, target: null, from: null };
    });
    expect(found.parked, 'parked cars along Jalan Main Bazaar').toBeGreaterThan(3);
    expect(found.from, 'a free approach to a parked car').toBeTruthy();
    const target = found.target!, from = found.from;
    await placeCar(page, from!.x, from!.z, from!.h);
    await getIn(page);
    const hit = await hold(page, ['KeyW'], 90);
    s = await carState(page);
    expect(hit.everInBuilding).toBe(false);
    expect(hit.maxImpact).toBeGreaterThan(2);
    const gap = Math.hypot(s.x - target.x, s.z - target.z);
    expect(gap).toBeGreaterThan(HALF_LEN + target.half - 0.1);
    expect(gap).toBeLessThan(HALF_LEN + target.half + 0.6);
    await hold(page, ['Space'], 30);
    await page.keyboard.press('KeyE');

    // 3. Toward the Sarawak River from the waterfront promenade: the car never enters the water.
    const sp = manifest.spawn;
    await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), [sp.x, sp.z]);
    await waitChunks(page);
    await placeCar(page, sp.x, sp.z, Math.PI); // facing north, at the river
    await getIn(page);
    const river = await hold(page, ['KeyW'], 360);
    s = await carState(page);
    expect(river.everInWater).toBe(false);
    expect(river.everInBuilding).toBe(false);
    expect(s.inWater).toBe(false);
    expect(Math.abs(s.vf)).toBeLessThan(1);
    expect(river.blocked.includes('water') || river.maxImpact > 0, `stopped by the bank (${river.blocked}, impact ${river.maxImpact})`).toBe(true);
    expect(sp.z - s.z).toBeLessThan(60);
    expect(issues.errors).toEqual([]);
  });

  test('drives round a real block through four junctions, on the road surface all the way', async ({ page }) => {
    const issues = watch(page);
    await ready(page);
    await getIn(page);
    const r = await driveRoute(page, BLOCK_LOOP, { speed: 9, speedup: 2, maxSeconds: 200 });
    expect(r.reached).toBe(true);
    expect(r.everInBuilding).toBe(false);
    expect(r.everInWater).toBe(false);
    expect(r.blocked).toEqual([]);
    for (const n of ['Jalan China', 'Jalan Carpenter', 'Jalan Bishopgate', 'Jalan Main Bazaar']) expect(r.roads).toContain(n);
    expect(r.distance).toBeGreaterThan(330);
    expect(r.distance).toBeLessThan(460);
    expect(r.offRoadFrames).toBeLessThan(r.frames * 0.02);
    expect(r.recoveries).toBe(0);
    expect(r.maxImpact).toBeLessThan(2);
    // Road and terrain alignment: the wheels stay on the surface, the body follows the slope.
    expect(r.maxHeightError).toBeLessThan(0.25);
    expect(r.maxPitch).toBeLessThan(0.2);
    expect(r.maxRoll).toBeLessThan(0.15);
    expect(r.unbuiltFrames).toBe(0);
    const s = await carState(page);
    expect(s.road).toBe('Jalan China');
    expect(Math.abs(s.vf)).toBeLessThan(0.1);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(false);
    expect((await state(page)).inBuilding).toBe(false);
    expect(issues.errors).toEqual([]);
  });

  test('V7 Jalan China rendering: pull out and drive the lane between the two rows of parked cars', async ({ page }) => {
    const issues = watch(page);
    await ready(page);
    await toDoor(page);
    await page.evaluate(() => (window as any).__k3d.v5.setMode('c'));
    await page.waitForFunction(() => (window as any).__k3d.v5.mode === 'c' && !(window as any).__k3d.v5.busy, null, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    await waitChunks(page);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    // The car's waiting place is clear in this rendering too (nothing of the street section stands in it).
    const s0 = await carState(page);
    expect(Math.hypot(s0.x - CAR_START.x, s0.z - CAR_START.z)).toBeLessThan(0.01);
    expect(await k3d(page, (k) => k.driving.car.canOccupy(k.driving.car.x, k.driving.car.z, k.driving.car.heading))).toBe(true);
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(true);

    // Lane keeping in the street's own frame (src/v5/geo.ts): hold the middle of the pier-to-pier width, heading
    // down the one-way street, at 12 km/h. Steering and throttle go through the normal input path.
    const frame = { ox: CHINA.ox, oz: CHINA.oz, dx: CHINA.dx, dz: CHINA.dz, nx: CHINA.nx, nz: CHINA.nz };
    const r = await page.evaluate((F) => new Promise<{ s: number; frames: number; everInBuilding: boolean; maxImpact: number; hardHits: number; minSpeedAfterStart: number; maxOff: number }>((resolve) => {
      const k = (window as any).__k3d, car = k.driving.car, c = k.world.collision;
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a)), street = Math.atan2(-F.dx, -F.dz);
      const res = { s: 0, frames: 0, everInBuilding: false, maxImpact: 0, hardHits: 0, minSpeedAfterStart: 99, maxOff: 0 };
      const tick = () => {
        const s = (car.x - F.ox) * F.dx + (car.z - F.oz) * F.dz, o = (car.x - F.ox) * F.nx + (car.z - F.oz) * F.nz;
        res.s = s;
        const f = car.footprint(-0.05);
        for (let i = 0; i < 8; i += 2) if (c.insideBuilding(f[i], f[i + 1], car.y, false)) res.everInBuilding = true;
        res.maxImpact = Math.max(res.maxImpact, car.impact);
        if (car.impact > 1.5) res.hardHits++;
        if (res.frames > 240) res.minSpeedAfterStart = Math.min(res.minSpeedAfterStart, car.vf);
        if (s < 78) res.maxOff = Math.max(res.maxOff, Math.abs(o));
        if (s < 9 || ++res.frames > 60 * 70) { k.input.touchX = k.input.touchY = 0; return resolve(res); }
        // East (positive o) is the left of a car heading down the street: steer right to come back.
        const want = street - Math.max(-0.4, Math.min(0.4, o * 0.22));
        const err = wrap(want - car.heading);
        k.input.touchX = Math.max(-1, Math.min(1, -err * 2.2));
        k.input.touchY = Math.max(-1, Math.min(1, (3.4 - car.vf) * 0.8)) || 1e-3;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), frame);
    await page.screenshot({ path: 'test-results/driving-v7-lane.png' });
    expect(r.s, `reached the Jalan Carpenter end (station ${r.s.toFixed(1)} m)`).toBeLessThan(9);
    expect(r.everInBuilding).toBe(false);
    expect(r.hardHits).toBe(0);
    expect(r.minSpeedAfterStart).toBeGreaterThan(1.5); // never brought to a stand by a parked car
    expect(r.maxOff).toBeLessThan(0.6);
    await hold(page, ['Space'], 60);
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(false);
    expect(issues.errors).toEqual([]);
  });

  test('switching between driving, OP fly mode and walking', async ({ page }) => {
    const issues = watch(page);
    await ready(page);
    await getIn(page);
    await hold(page, ['KeyW'], 50);
    expect((await carState(page)).vf).toBeGreaterThan(3);

    // P while driving: the fly camera takes over, the car brakes to a stop by itself and is not steered.
    await page.keyboard.press('KeyP');
    expect(await k3d(page, (k) => k.fly.active)).toBe(true);
    await frames(page, 120);
    const stopped = await carState(page);
    expect(stopped.active).toBe(true);
    expect(stopped.vf).toBe(0);
    const fly0 = await k3d(page, (k) => ({ x: k.fly.position.x, z: k.fly.position.z }));
    await hold(page, ['KeyW'], 40);
    const fly1 = await k3d(page, (k) => ({ x: k.fly.position.x, z: k.fly.position.z }));
    expect(Math.hypot(fly1.x - fly0.x, fly1.z - fly0.z)).toBeGreaterThan(5);
    let s = await carState(page);
    expect(Math.hypot(s.x - stopped.x, s.z - stopped.z)).toBeLessThan(0.01);
    // R belongs to the reference panel in OP mode, not to the car.
    await page.keyboard.press('KeyR');
    await frames(page, 3);
    s = await carState(page);
    expect(Math.hypot(s.x - stopped.x, s.z - stopped.z)).toBeLessThan(0.01);
    await page.keyboard.press('KeyR');

    // P again: back in the car, chase camera behind it, controls live.
    await page.keyboard.press('KeyP');
    await frames(page, 5);
    expect(await k3d(page, (k) => k.fly.active)).toBe(false);
    expect((await carState(page)).active).toBe(true);
    const cam = await k3d(page, (k) => ({ d: Math.hypot(k.camera.position.x - k.driving.car.x, k.camera.position.z - k.driving.car.z), visible: k.player.visual.root.visible }));
    expect(cam.d).toBeLessThan(15);
    expect(cam.visible).toBe(false);
    await hold(page, ['KeyW'], 40);
    expect((await carState(page)).vf).toBeGreaterThan(2);
    // V (first person) does nothing in the car.
    await page.keyboard.press('KeyV');
    expect(await k3d(page, (k) => k.tpc.firstPerson)).toBe(false);
    // Esc pauses the car too.
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeVisible();
    const p0 = await carState(page);
    await frames(page, 30);
    const p1 = await carState(page);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBe(0);
    await page.locator('#pause-resume').click();
    await hold(page, ['Space'], 80);
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(false);

    // On foot: OP mode and back, walking resumes at the same place (V6 behaviour).
    const foot = await state(page);
    await page.keyboard.press('KeyP');
    await hold(page, ['KeyW'], 30);
    await page.keyboard.press('KeyP');
    await frames(page, 3);
    const back = await state(page);
    expect(Math.hypot(back.x - foot.x, back.z - foot.z)).toBeLessThan(0.05);
    expect(await k3d(page, (k) => k.player.visual.root.visible)).toBe(true);

    // "Return to Waterfront" from the driver's seat puts the character back on foot at the spawn; the car stays.
    await getIn(page);
    const left = await carState(page);
    await page.keyboard.press('Escape');
    await page.locator('#pause-reset').click();
    if (await page.locator('#pause').isVisible()) await page.locator('#pause-resume').click();
    await frames(page, 5);
    s = await carState(page);
    expect(s.active).toBe(false);
    expect(Math.hypot(s.x - left.x, s.z - left.z)).toBeLessThan(0.01);
    const sp = manifest.spawn, at = await state(page);
    expect(Math.hypot(at.x - sp.x, at.z - sp.z)).toBeLessThan(1);
    await expect(page.locator('#speedo')).toBeHidden();
    const w = await walk(page, [[sp.x + 4, sp.z + 1]], { tolerance: 1, maxSeconds: 15 });
    expect(w.reached).toBe(true);
    expect(issues.errors).toEqual([]);
  });

  test('high-speed run: chunks stream ahead of the car, nothing is driven on before it is loaded, memory stays bounded', async ({ page }) => {
    test.setTimeout(420_000);
    const issues = watch(page);
    await start(page);
    await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
    // Jalan Tun Abang Haji Openg, northbound carriageway: 2.2 km of one mapped road toward the old town.
    const { pts } = chainOfWays(waysNamed('Jalan Tun Abang Haji Openg'), [-411, 2475]);
    expect(pathLength(pts)).toBeGreaterThan(2000);
    // Start 150 m in from the edge of the prepared area.
    let skip = 0, acc = 0;
    while (acc < 150) { acc += Math.hypot(pts[skip + 1][0] - pts[skip][0], pts[skip + 1][1] - pts[skip][1]); skip++; }
    const route = pts.slice(skip);
    const h0 = Math.atan2(route[1][0] - route[0][0], route[1][1] - route[0][1]);
    await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), route[0]);
    await waitChunks(page);
    await placeCar(page, route[0][0], route[0][1], h0);
    await getIn(page);
    const before = await k3d(page, (k) => ({ ...k.world.chunks.stats, geo: k.renderer.info.memory.geometries, tex: k.renderer.info.memory.textures, heap: (performance as any).memory?.usedJSHeapSize ?? 0, chunks: k.world.chunks.loadedCount }));

    const r = await driveRoute(page, route, { speed: 27, cornerSpeed: 9, realTime: true, maxSeconds: 300, tolerance: 8 });
    const after = await k3d(page, (k) => ({ ...k.world.chunks.stats, geo: k.renderer.info.memory.geometries, tex: k.renderer.info.memory.textures, heap: (performance as any).memory?.usedJSHeapSize ?? 0, chunks: k.world.chunks.loadedCount, inMemory: k.world.chunks.chunks.size, quality: k.world.chunks.quality.name, lowRadius: k.world.chunks.quality.lowRadius }));
    const fps = r.frames / r.seconds;
    const report = {
      road: 'Jalan Tun Abang Haji Openg (northbound carriageway)', routeMetres: Math.round(pathLength(route)), drivenMetres: Math.round(r.distance), seconds: +r.seconds.toFixed(1),
      maxKmh: +r.maxKmh.toFixed(1), avgKmh: +r.avgKmh.toFixed(1), fps: +fps.toFixed(1), maxFrameMs: +r.maxFrameMs.toFixed(1), quality: after.quality,
      chunksFetched: after.fetched - before.fetched, chunksBuilt: after.built - before.built, chunksDisposed: after.disposed - before.disposed, maxChunkMeshes: r.maxChunks, chunkMeshesAtEnd: after.chunks, chunkDataAtEnd: after.inMemory,
      chunkBuildMsMax: +after.maxBuildMs.toFixed(1), geometries: [before.geo, after.geo], textures: [before.tex, after.tex], heapMB: [Math.round(before.heap / 1e6), Math.round(after.heap / 1e6)],
      unbuiltFrames: r.unbuiltFrames, blocked: r.blocked, impacts: r.impacts, maxImpact: +r.maxImpact.toFixed(1), impactsAt: r.impactsAt, recoveries: r.recoveries, offRoadFrames: r.offRoadFrames, frames: r.frames, viewport: page.viewportSize(),
    };
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/driving-perf.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));

    expect(r.reached).toBe(true);
    expect(r.distance).toBeGreaterThan(1800);
    expect(r.maxKmh).toBeGreaterThan(80);
    expect(r.everInBuilding).toBe(false);
    expect(r.everInWater).toBe(false);
    // Streaming kept ahead of the car: never stopped at an unloaded chunk, never on ground without a mesh.
    expect(r.blocked).not.toContain('loading');
    expect(r.unbuiltFrames).toBe(0);
    expect(after.fetched - before.fetched).toBeGreaterThan(20);
    // Chunks behind the car are disposed: the number held does not grow with the distance driven.
    expect(after.disposed - before.disposed).toBeGreaterThan(20);
    // (Meshes are kept one ring beyond the wanted radius before they are dropped: the existing hysteresis.)
    const R = after.lowRadius;
    expect(r.maxChunks).toBeLessThanOrEqual((2 * R + 3) ** 2);
    expect(after.inMemory).toBeLessThanOrEqual((2 * R + 3) ** 2 + 18);
    expect(after.geo).toBeLessThan(before.geo * 2.5 + 400);
    expect(fps).toBeGreaterThan(25);
    expect(issues.errors).toEqual([]);
  });
});
