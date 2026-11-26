// N1-M7 the play loop in the real game (desktop): four kinds of vehicle to take, the horn, collisions with a damage
// tint and a repair, and one whole job from the phone (accepted, driven by GPS, paid, saved and loaded).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, seedCharacter, frames } from './helpers.ts';
import { carState, placeCar, driveRoute } from './driving-helpers.ts';
import { CHINA } from '../../src/v5/geo.ts';
import { CAR_START } from '../../src/vehicle/VehiclePhysics.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
/** V7 Jalan China: the lane between the parked rows into the Jalan Carpenter junction (as gps.spec.ts). */
const CHINA_LANE: [number, number][] = ([[60, 0], [30, 0], [-4.5, 0], [-3.5, 8], [-3, 14]] as [number, number][]).map(([s, o]) => CHINA.toWorld(s, o));

async function ready(page: Page): Promise<void> {
  await seedCharacter(page);
  await page.goto('./');
  await start(page, { navigate: false });
  await page.waitForFunction(() => { const k = (window as any).__k3d; return k.driving.placed && k.life?.active && k.life.render.walkerTriangles > 0 && k.life.render.group.children.every((o: any) => o.name === 'life-headlights' || o.visible || o.count === 0); }, null, { timeout: 60_000 });
  // the three starters stand on the riverside footpath of Jalan Main Bazaar once their chunk has been worked out
  await page.waitForFunction(() => (window as any).__k3d.play.parked.filter((p: any) => String(p.key).startsWith('start:')).length === 3, null, { timeout: 30_000 });
}

/** Stand the walker beside a parked vehicle (or the player's own, `id` 0), on its left, clear of its body. */
const standBeside = (page: Page, id: number) => page.evaluate((id) => {
  const k = (window as any).__k3d, q = id ? k.play.parked.find((p: any) => p.id === id) : { ...k.driving.car, kind: -1 };
  const hw = id ? [0.87, 0.86, 0.91, 0.36, 0.86, 0.93][q.kind] : k.driving.car.spec.halfWid;
  const col = k.world.collision;
  for (const side of [1, -1]) for (const along of [0, 0.8, -0.8]) {
    const x = q.x + Math.cos(q.heading) * (hw + 1.1) * side + Math.sin(q.heading) * along, z = q.z - Math.sin(q.heading) * (hw + 1.1) * side + Math.cos(q.heading) * along;
    const [rx, rz] = col.resolve(x, z, 0.35, q.y);
    if (Math.hypot(rx - x, rz - z) > 0.3 || col.insideBuilding(x, z, q.y + 0.3)) continue;
    k.player.teleport(x, z);
    k.tpc.snap();
    return true;
  }
  return false;
}, id);

/** Hold the throttle for `n` simulated frames (in the page, so the car never moves across a round trip), then brake to rest. */
const burst = (page: Page, n: number, throttle = 1) => page.evaluate(({ n, throttle }) => new Promise<{ maxKmh: number }>((resolve) => {
  const k = (window as any).__k3d, car = k.driving.car;
  k.setSimulatedDt(1 / 60);
  let i = 0, maxKmh = 0;
  const tick = () => {
    maxKmh = Math.max(maxKmh, car.kmh);
    if (i++ < n) k.input.touchY = throttle;
    else { k.input.touchY = Math.abs(car.vf) > 0.3 ? -Math.sign(car.vf) : 0; if (Math.abs(car.vf) <= 0.3) { k.input.touchY = 0; k.setSimulatedDt(0); return resolve({ maxKmh }); } }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { n, throttle });

test.describe('N1-M7 play loop', () => {
  test('any parked vehicle can be taken: car, kapcai, taxi and pickup; horn, collision, damage and repair', async ({ page }) => {
    test.setTimeout(300_000);
    const issues = watch(page);
    await ready(page);
    await expect(page.locator('#wallet-money')).toHaveText('RM 0.00');
    const starters: { id: number; drive: string; d: number; dy: number }[] = await k3d(page, (k) => k.play.parked.filter((p: any) => String(p.key).startsWith('start:')).map((p: any) => ({ id: p.id, drive: p.drive, d: Math.hypot(p.x - k.driving.car.x, p.z - k.driving.car.z), dy: p.y - k.world.collision.groundAt(p.x, p.z, p.y + 0.5).h })));
    expect(starters.map((s) => s.drive).sort()).toEqual(['kapcai', 'pickup', 'taxi']);
    for (const s of starters) { expect(s.d).toBeLessThan(60); expect(Math.abs(s.dy)).toBeLessThan(0.15); }
    // they are drawn (in the traffic's meshes), and the first frames with them are over
    await frames(page, 30);
    const drawn = await k3d(page, (k) => Object.fromEntries(k.life.render.group.children.map((o: any) => [o.name, o.visible ? o.count : 0])));
    expect(drawn['life-vehicles-3']).toBeGreaterThan(0); // kapcai
    expect(drawn['life-vehicles-4']).toBeGreaterThan(0); // taxi
    expect(drawn['life-vehicles-5']).toBeGreaterThan(0); // pickup
    // (the car's lamps are compiled when it is first got into, as since V8.3: get in and brake once before counting)
    expect(await standBeside(page, 0)).toBe(true);
    await frames(page, 4);
    await expect(page.locator('#car-prompt')).toContainText('Enter Car');
    await page.keyboard.press('KeyE');
    await burst(page, 20);
    await page.keyboard.press('KeyE');
    await frames(page, 20);
    expect((await carState(page)).active).toBe(false);
    // (and walking up to the waterfront kerb compiles two shadow-pass variants of the world's own, with ?m7=0 too:
    // visit the three places first, so that what is counted is the vehicles)
    for (const q of starters) { expect(await standBeside(page, q.id)).toBe(true); await frames(page, 45); }
    const programs = await k3d(page, (k) => k.renderer.info.programs.length);

    // a parked vehicle blocks the walker, and offers itself
    const prompts: Record<string, string> = { kapcai: 'Ride Kapcai', taxi: 'Enter Taxi', pickup: 'Enter Pickup' };
    const sizes: Record<string, number> = { kapcai: 0.95, taxi: 2.2, pickup: 2.65 };
    let last = { kind: 'hatch', x: 0, z: 0 };
    for (const kind of ['kapcai', 'taxi', 'pickup']) {
      const s = starters.find((q) => q.drive === kind)!;
      last = await k3d(page, (k) => ({ kind: k.driving.kind, x: k.driving.car.x, z: k.driving.car.z }));
      expect(await standBeside(page, s.id)).toBe(true);
      await frames(page, 4);
      await expect(page.locator('#car-prompt')).toBeVisible();
      await expect(page.locator('#car-prompt')).toContainText(prompts[kind]);
      expect(await k3d(page, (k) => k.play.near?.drive)).toBe(kind);
      await page.keyboard.press('KeyE');
      await frames(page, 3);
      const got = await k3d(page, (k) => ({ active: k.driving.active, kind: k.driving.kind, half: k.driving.car.spec.halfLen, model: k.driving.model.kind, parked: k.play.parked.map((p: any) => p.id),
        left: k.play.parked.filter((p: any) => !p.key).map((p: any) => ({ drive: p.drive, x: p.x, z: p.z })), body: k.player.visual.root.visible, modelShown: k.driving.model.root.visible && k.driving.model.root.parent === k.driving.mount }));
      expect(got).toMatchObject({ active: true, kind, half: sizes[kind], model: kind, body: false, modelShown: true });
      // the vehicle the player had stands where it was left, as a parked one; the taken one is no longer parked
      expect(got.parked).not.toContain(s.id);
      expect(got.left.some((p: any) => p.drive === last.kind && Math.hypot(p.x - last.x, p.z - last.z) < 0.01)).toBe(true);
      // it drives
      const b = await burst(page, 70);
      expect(b.maxKmh).toBeGreaterThan(8);
      expect((await carState(page)).inBuilding).toBe(false);
      // the horn sounds while H is held
      const horn0 = await k3d(page, (k) => k.play.sfx.played.horn);
      await page.keyboard.down('KeyH');
      await frames(page, 4);
      expect(await k3d(page, (k) => k.play.sfx.played.horn)).toBe(horn0 + 1);
      await page.keyboard.up('KeyH');
      await page.keyboard.press('KeyE');
      await frames(page, 3);
      expect((await carState(page)).active).toBe(false);
    }
    // the hatchback that waited in Jalan China is still there to go back to
    const hatch = await k3d(page, (k) => k.play.parked.find((p: any) => !p.key && p.drive === 'hatch')?.id ?? 0);
    expect(hatch).toBeGreaterThan(0);
    expect(await standBeside(page, hatch)).toBe(true);
    await frames(page, 4);
    await expect(page.locator('#car-prompt')).toContainText('Enter Car');
    await page.keyboard.press('KeyE');
    await frames(page, 3);
    expect(await k3d(page, (k) => [k.driving.active, k.driving.kind, k.driving.paint])).toEqual([true, 'hatch', 0xf2b632]);
    // taking and driving four kinds compiled no shader program
    expect(await k3d(page, (k) => k.renderer.info.programs.length)).toBe(programs);

    // --- a collision: into a pickup standing in the car's own lane, 30 m down Jalan China (it does not move; the car is
    // pushed out, dented and slowed). The pickup is put there for the test; the car starts from where it waits at first.
    const target = await page.evaluate(([x, z, heading]) => {
      const k = (window as any).__k3d, p = k.play.make('pickup', 0xf1f1ee, 0, x, z, heading, 'test:lane', null);
      k.play.parked.push(p);
      return { id: p.id as number, x: p.x as number, z: p.z as number, heading: p.heading as number, damage: p.damage as number };
    }, [...CHINA.toWorld(61, 0), CAR_START.heading]);
    await placeCar(page, CAR_START.x, CAR_START.z, CAR_START.heading);
    await frames(page, 5);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const k = (window as any).__k3d;
      k.setSimulatedDt(1 / 60);
      let n = 0;
      const tick = () => { k.input.touchY = n < 260 ? 1 : 0.001; if (n++ > 320) { k.input.touchY = 0; k.setSimulatedDt(0); return resolve(); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    const after = await k3d(page, (k) => {
      const d = k.driving, car = d.car, p = k.play.parked.find((q: any) => q.key === 'test:lane');
      // gap between the two bodies along the pickup's axis (the car came from behind it)
      const along = (car.x - p.x) * Math.sin(p.heading) + (car.z - p.z) * Math.cos(p.heading);
      return { crashes: k.play.crashes, hardest: k.play.hardest, damage: d.damage, power: car.power, other: p.damage, gap: -along - 2.65 - car.spec.halfLen, sound: k.play.sfx.played.crash,
        paint: d.model.mats.carpaint.color.getHex() };
    });
    expect(after.crashes).toBeGreaterThanOrEqual(1);
    expect(after.hardest).toBeGreaterThan(8);
    expect(after.sound).toBeGreaterThanOrEqual(1);
    expect(after.damage).toBeGreaterThan(0.08);
    expect(after.other).toBeGreaterThan(target.damage);
    expect(after.gap).toBeGreaterThan(-0.05); // not inside the pickup
    expect(after.paint).not.toBe(0xf2b632); // the damage tint
    await expect(page.locator('#speedo-note')).toContainText('DAMAGE'); // (off the road it takes turns with OFF ROAD)

    // --- the traffic reacts: run into an ambient vehicle from behind; it stops, and its driver hoots
    const bumped = await page.evaluate(() => new Promise<{ tried: number; halt: number; honks: number; crashes: number } | null>((resolve) => {
      const k = (window as any).__k3d, d = k.driving, car = d.car, t = k.life.traffic;
      const list = t.vehicles.slice().sort((a: any, b: any) => Math.hypot(a.x - car.x, a.z - car.z) - Math.hypot(b.x - car.x, b.z - car.z));
      let tried = 0;
      for (const v of list) {
        const x = v.x - Math.sin(v.heading) * 9, z = v.z - Math.cos(v.heading) * 9;
        if (!k.world.collision.isLoaded(x, z) || !car.canOccupy(x, z, v.heading)) continue;
        tried++;
        car.place(x, z, v.heading); d.position.set(car.x, car.y, car.z); d.camera.snap(car);
        k.player.position.copy(d.position);
        const honks0 = k.play.sfx.played.honk, crashes0 = k.play.crashes;
        k.setSimulatedDt(1 / 60);
        let n = 0, halt = 0;
        const tick = () => {
          k.input.touchY = 1;
          // steer at it (it may be rounding a bend)
          const err = Math.atan2(Math.sin(Math.atan2(v.x - car.x, v.z - car.z) - car.heading), Math.cos(Math.atan2(v.x - car.x, v.z - car.z) - car.heading));
          k.input.touchX = Math.max(-1, Math.min(1, -err * 2));
          halt = Math.max(halt, v.halt);
          if (halt > 0 && n > 30 || n++ > 420) {
            k.input.touchX = k.input.touchY = 0;
            // (the hoot comes a third of a second after the blow)
            let wait = 0;
            const done = () => { if (wait++ < 50) return void requestAnimationFrame(done); k.setSimulatedDt(0); resolve({ tried, halt, honks: k.play.sfx.played.honk - honks0, crashes: k.play.crashes - crashes0 }); };
            return void requestAnimationFrame(done);
          }
          requestAnimationFrame(tick);
        };
        return void requestAnimationFrame(tick);
      }
      resolve(null);
    }));
    expect(bumped, 'an ambient vehicle with room behind it').not.toBeNull();
    expect(bumped!.halt).toBeGreaterThan(0);
    expect(bumped!.honks).toBeGreaterThanOrEqual(1);

    // --- the garage: a repair costs money, and there is none yet
    await burst(page, 1);
    await page.keyboard.press('KeyT');
    await expect(page.locator('#phone')).toBeVisible();
    expect(await k3d(page, (k) => k.input.enabled)).toBe(false);
    await page.locator('#ph-garage').click();
    await expect(page.locator('#ph-repair')).toBeDisabled();
    await page.keyboard.press('KeyT');
    await expect(page.locator('#phone')).toBeHidden();
    expect(await k3d(page, (k) => k.input.enabled)).toBe(true);
    const dmg = await k3d(page, (k) => { k.play.money = 100; return k.driving.damage; });
    expect(dmg).toBeGreaterThan(0.08);
    await page.locator('#btn-phone').click();
    await page.locator('#ph-garage').click();
    await page.locator('#ph-repair').click();
    const fixed = await k3d(page, (k) => ({ damage: k.driving.damage, money: k.play.money, power: k.driving.car.power, paint: k.driving.model.mats.carpaint.color.getHex() }));
    expect(fixed.damage).toBe(0);
    expect(fixed.power).toBe(1);
    expect(fixed.money).toBeLessThan(100);
    expect(fixed.paint).toBe(0xf2b632);
    await expect(page.locator('#ph-money')).not.toHaveText('RM 100.00');
    await page.keyboard.press('Escape'); // Esc closes the phone, it does not pause
    await expect(page.locator('#phone')).toBeHidden();
    await expect(page.locator('#pause')).toBeHidden();
    expect(issues.errors).toEqual([]);
  });

  test('a new player finishes a food delivery: phone, GPS to the pick-up and the drop-off, money, save and load', async ({ page }) => {
    test.setTimeout(600_000);
    const issues = watch(page);
    await ready(page);
    await k3d(page, (k) => k.play.seed(20261126));
    // get into the car that waits in Jalan China
    expect(await standBeside(page, 0)).toBe(true);
    await frames(page, 4);
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#toast')).toContainText('phone');

    // the phone: delivery offers, each a kind of place and its street, none a business name
    await page.keyboard.press('KeyT');
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#ph-money')).toHaveText('RM 0.00');
    await page.locator('#ph-taxi').click();
    await expect(page.locator('#phone .ph-note').first()).toContainText('taxi'); // fares need the taxi
    await page.locator('#phone .ph-back').click();
    await page.locator('#ph-delivery').click();
    await expect(page.locator('.ph-offer').first()).toBeVisible({ timeout: 30_000 });
    const offers = await k3d(page, (k) => k.play.offersShown.map((o: any) => ({ id: o.id, from: o.from, to: o.to, approach: o.approach, trip: o.trip, fare: o.fare })));
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const o of offers) { expect(o.from.group).toBe('food'); expect(o.from.name).toBeUndefined(); expect(o.to.name).toBeUndefined(); }
    const texts = await page.locator('.ph-offer').allTextContents();
    for (const t of texts) expect(t).toMatch(/^a restaurant(, .+)?to (a hotel|an office|a school|a clinic or hospital|a shop)/);
    const job = offers[0];
    await page.locator('.ph-offer').first().click();
    await expect(page.locator('#phone')).toBeHidden();
    await expect(page.locator('#wallet-job')).toContainText('collect at a restaurant');
    await page.waitForFunction(() => { const n = (window as any).__k3d.minimap.nav; return n && n.target.id === 'job-goal' && n.mode === 'drive' && !!n.route; }, null, { timeout: 20_000 });
    await expect(page.locator('#nav-hint')).toBeVisible();
    await expect(page.locator('#nav-hint .nav-sub')).toContainText('pick-up: a restaurant');

    /** Follow the GPS to wherever the job is heading, re-reading the route when the GPS re-plans, until the stage changes. */
    const follow = async (stage: 'pickup' | 'dropoff') => {
      let impacts = 0;
      for (let leg = 0; leg < 8; leg++) {
        const pts = await k3d(page, (k) => {
          const n = k.minimap.nav, car = k.driving.car;
          if (!n || n.target.id !== 'job-goal' || !n.route) return null;
          // the route from where the car is on it
          const r = n.route, out: [number, number][] = [];
          let best = 0, bd = Infinity;
          for (let i = 0; i < r.points.length; i += 2) { const d = Math.hypot(r.points[i] - car.x, r.points[i + 1] - car.z); if (d < bd) { bd = d; best = i; } }
          for (let i = best + 2; i < r.points.length; i += 2) out.push([r.points[i], r.points[i + 1]]);
          return out;
        });
        if (!pts) { await page.waitForTimeout(500); continue; }
        if (pts.length) {
          const res = await driveRoute(page, pts, { speed: 9, speedup: 3, tolerance: 6, maxSeconds: 420 });
          impacts += res.impacts;
          expect(res.everInWater).toBe(false);
        }
        // arrival is noticed within a quarter of a second of standing still at the stopping point
        const done = await page.waitForFunction((stage) => { const j = (window as any).__k3d.play.job; return !j || j.stage !== stage; }, stage, { timeout: 4000 }).then(() => true, () => false);
        if (done) return impacts;
      }
      throw new Error(`the ${stage} was not reached: ${JSON.stringify(await carState(page))}`);
    };

    // out of Jalan China by the lane between the parked rows (the mapped centre line runs through a parked row)
    const lane = await driveRoute(page, CHINA_LANE, { speed: 6, speedup: 3, maxSeconds: 120 });
    expect(lane.reached).toBe(true);
    await follow('pickup');
    await expect(page.locator('#toast')).toContainText('Order collected');
    await expect(page.locator('#wallet-job')).toContainText('take to');
    await expect(page.locator('#nav-hint .nav-sub')).toContainText('drop-off');
    expect(await k3d(page, (k) => k.play.job.stage)).toBe('dropoff');
    await follow('dropoff');

    // paid: the fare and perhaps a tip, into the wallet; the job is over and the route is cleared
    const end = await k3d(page, (k) => ({ money: k.play.money, paid: k.play.paid, job: k.play.job, stats: { ...k.play.stats, vehicle: null }, nav: k.minimap.nav?.target.id ?? null, cash: k.play.sfx.played.cash, saved: localStorage.getItem('k3d.save') }));
    expect(end.job).toBeNull();
    expect(end.paid).toHaveLength(1);
    expect(end.paid[0].kind).toBe('delivery');
    expect(end.money).toBeGreaterThanOrEqual(job.fare);
    expect(end.money).toBeLessThanOrEqual(Math.round(job.fare * 1.4 * 10) / 10 + 0.11);
    expect(end.stats.delivery).toBe(1);
    expect(end.nav).not.toBe('job-goal');
    expect(end.cash).toBe(1);
    await expect(page.locator('#toast')).toContainText('Delivered');
    await expect(page.locator('#wallet-money')).toHaveText(`RM ${end.money.toFixed(2)}`);
    await expect(page.locator('#wallet-job')).toBeHidden();
    // saved by itself when the job was paid
    const saved = JSON.parse(end.saved!);
    expect(saved).toMatchObject({ v: 1, money: end.money, earned: end.money, delivery: 1, taxi: 0 });
    expect(saved.vehicle.kind).toBe('hatch');
    const where = await carState(page);
    expect(Math.hypot(saved.vehicle.x - where.x, saved.vehicle.z - where.z)).toBeLessThan(3);

    // a reload brings the money back, and the car stands where the job ended
    await page.reload();
    await start(page, { navigate: false });
    await expect(page.locator('#wallet-money')).toHaveText(`RM ${end.money.toFixed(2)}`);
    const back = await k3d(page, (k) => ({ money: k.play.money, delivery: k.play.stats.delivery, start: k.driving.start, kind: k.driving.kind }));
    expect(back.money).toBe(end.money);
    expect(back.delivery).toBe(1);
    expect(back.kind).toBe('hatch');
    expect(Math.hypot(back.start.x - saved.vehicle.x, back.start.z - saved.vehicle.z)).toBeLessThan(0.01);
    // a damaged saved value is ignored, not fatal
    await page.evaluate(() => localStorage.setItem('k3d.save', '{"v":1,"money":"lots"'));
    await page.reload();
    await start(page, { navigate: false });
    await expect(page.locator('#wallet-money')).toHaveText('RM 0.00');
    expect(issues.errors).toEqual([]);
  });
});
