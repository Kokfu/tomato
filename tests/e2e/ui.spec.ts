// V8 UI cleanup: default rendering, the developer renderer comparison in Settings, the pause menu's "Drive Car"
// and the contextual controls (Enter / Exit Car, Inspect Shop, driving and OP mode help).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { watch, start, state, frames, walk, waitChunks, chainOfWays, manifest } from './helpers.ts';
import { carState, placeCar, waysNamed } from './driving-helpers.ts';

const SHOTS = 'docs/screenshots/v8-ui';
const STREET_VIEWS = JSON.parse(readFileSync('tools/dev/street-views.json', 'utf8'));
const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const shot = async (page: Page, name: string) => { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const modeSettled = (page: Page, m: string) => page.waitForFunction((m) => { const v = (window as any).__k3d.v5; return v?.mode === m && !v.busy; }, m, { timeout: 60_000 });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Let the HUD (refreshed four times a second) catch up. */
const hudTick = (page: Page) => frames(page, 20);

/** A walkable spot within 7 m of a place but out of the car's reach, or, with `car`, one at a free car pose's door. */
const findShopSpot = (page: Page, withCar: boolean) => page.evaluate((withCar) => {
  const k = (window as any).__k3d, c = k.world.collision, d = k.driving, car = d.car;
  const dataAt = (cx: number, cz: number) => k.world.chunks.dataAt(cx, cz);
  const free = (x: number, z: number) => {
    if (!c.isLoaded(x, z) || c.inWater(x, z)) return false;
    const g = c.groundAt(x, z, 1e6);
    if (c.insideBuilding(x, z, g.h)) return false;
    const [rx, rz] = c.resolve(x, z, 0.35, g.h);
    return Math.hypot(rx - x, rz - z) < 0.02;
  };
  const shopNear = (x: number, z: number) => k.world.places.near(x, z, 7, dataAt).length > 0;
  const cx = car.x, cz = car.z;
  if (!withCar) {
    for (let r = 8; r < 60; r += 1.5)
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        if (free(x, z) && shopNear(x, z)) return { x, z };
      }
    return null;
  }
  // A car pose on the street next to a shop (the car's own collision is lifted while searching).
  const home = { x: car.x, z: car.z, h: car.heading };
  k.world.collision.setDynamicWall('drivable-car', null, 0);
  for (let r = 0; r < 60; r += 2)
    for (let a = 0; a < Math.PI * 2; a += 0.25)
      for (const h of [home.h, home.h + Math.PI / 2]) {
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        if (!car.canOccupy(x, z, h)) continue;
        const side = 0.865 + 0.65, s = Math.sin(h), co = Math.cos(h);
        for (const v of [-side, side]) {
          const px = x + co * v, pz = z - s * v;
          if (free(px, pz) && shopNear(px, pz)) {
            car.place(home.x, home.z, home.h);
            return { car: { x, z, h }, door: { x: px, z: pz } };
          }
        }
      }
  car.place(home.x, home.z, home.h);
  return null;
}, withCar) as Promise<any>;

test.describe('V8 UI cleanup', () => {
  test('default rendering is V7 Jalan China; the legacy comparison lives in Developer settings; the build version is shown', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    // The start screen waited for the default rendering: it is on when the player gets control.
    expect(await k3d(page, (k) => ({ mode: k.v5.mode, busy: k.v5.busy, inScene: k.world.scene.children.includes(k.v5.scene.group) }))).toEqual({ mode: 'c', busy: false, inScene: true });
    // Outside the section the normal geographic chunks are drawn; only the section's blocks are left to it.
    expect(await k3d(page, (k) => k.world.chunks.loadedCount)).toBeGreaterThan(4);
    // No comparison selector on the game HUD.
    await expect(page.locator('#v5bar')).toBeHidden();
    expect(await page.locator('#dev-render #v5bar').count()).toBe(1);
    await waitChunks(page);
    await hudTick(page);
    await expect(page.locator('#help')).toContainText('jump');
    await page.waitForTimeout(800); // the first captures of a fresh GPU process can come back empty
    await shot(page, '01-hud-walking-default');

    // Settings: graphics presets as before, the version on its own line, the comparison behind "Developer settings".
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings')).toBeVisible();
    await expect(page.locator('#quality-seg button')).toHaveCount(3);
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const release = /^(V\d+(?:\.\d+)*)/.exec(execSync('git log -1 --format=%s', { encoding: 'utf8' }))?.[1] ?? '';
    await expect(page.locator('#build-version')).toContainText(`Version: ${release}`);
    await expect(page.locator('#build-version')).toContainText(commit);
    expect(await page.locator('#dev-settings #quality-seg, #dev-settings #build-version').count()).toBe(0);
    await expect(page.locator('#v5bar')).toBeHidden(); // collapsed
    await page.locator('#dev-settings summary').click();
    await expect(page.locator('#v5bar button')).toHaveText(['V4 Existing', 'V5 Procedural', 'V5 Hybrid', 'V7 Jalan China']);
    await expect(page.locator('#v5bar button.on')).toHaveText('V7 Jalan China');
    await shot(page, '02-settings-developer');
    for (const [label, m] of [['V4 Existing', 'v4'], ['V5 Procedural', 'a'], ['V5 Hybrid', 'b'], ['V7 Jalan China', 'c']]) {
      await page.locator('#v5bar button', { hasText: label }).click();
      await modeSettled(page, m);
      await expect(page.locator('#v5bar button.on')).toHaveText(label);
      expect(await k3d(page, (k) => k.v5.mode === 'v4' ? !k.world.scene.children.includes(k.v5.scene.group) : k.world.scene.children.includes(k.v5.scene.group))).toBe(true);
    }
    await page.locator('#settings-close').click();
    // Keys 1-4 still switch (development shortcut, unchanged binding).
    await page.keyboard.press('Digit1');
    await modeSettled(page, 'v4');
    await page.keyboard.press('Digit4');
    await modeSettled(page, 'c');
    expect(issues.errors).toEqual([]);
  });

  test('?render=v4 still starts in the legacy rendering, and saved views keep their rendering mode', async ({ page }) => {
    const issues = watch(page);
    await page.goto('./?render=v4');
    await start(page, { navigate: false });
    expect(await k3d(page, (k) => k.v5?.mode ?? 'v4')).toBe('v4');
    await page.waitForFunction(() => !!(window as any).__k3d.v5);
    // A view saved in V4 reopens in V4 (its link names the mode), one saved in V7 in V7.
    await page.keyboard.press('KeyP');
    const url = await k3d(page, (k) => k.fly.viewUrl());
    expect(new URL(url).searchParams.get('render')).toBe('v4');
    const v = STREET_VIEWS[0];
    await page.evaluate((v) => (window as any).__k3d.fly.applyPreset('c', v), v);
    await modeSettled(page, 'c');
    const saved = await k3d(page, (k) => ({ ...k.fly.currentView('t'), mode: 'v4' }));
    await page.evaluate((s) => (window as any).__k3d.fly.applyView(s), saved);
    await modeSettled(page, 'v4');
    const pose = await k3d(page, (k) => ({ x: k.fly.position.x, z: k.fly.position.z, yaw: k.fly.yaw }));
    expect(Math.hypot(pose.x - saved.x, pose.z - saved.z)).toBeLessThan(0.01);
    expect(Math.abs(pose.yaw - saved.yaw)).toBeLessThan(1e-4);
    await page.keyboard.press('KeyP');
    expect(issues.errors).toEqual([]);
  });

  test('pause menu Drive Car: streams the car\'s area, stands the character beside it facing it, E enters, E exits', async ({ page }) => {
    test.setTimeout(240_000);
    const issues = watch(page);
    await start(page);
    await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
    const parked = await carState(page);

    // Walk well away: 2 km up Jalan Tun Abang Haji Openg, until the car's chunk is unloaded.
    const { pts } = chainOfWays(waysNamed('Jalan Tun Abang Haji Openg'), [-411, 2475]);
    const far = pts[Math.floor(pts.length * 0.15)];
    await page.evaluate(([x, z]) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, far);
    await waitChunks(page);
    await page.waitForFunction(([x, z]) => !(window as any).__k3d.world.chunks.isReady(x, z), [parked.x, parked.z], { timeout: 60_000 });
    const before = await k3d(page, (k) => ({ disposed: k.world.chunks.stats.disposed, fetched: k.world.chunks.stats.fetched }));

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#pause-drive')).toBeEnabled();
    await expect(page.locator('#pause-drive')).toHaveText('Drive Car');
    await shot(page, '03-pause-menu');
    await page.locator('#pause-drive').click();
    await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });

    // Beside the car, on loaded walkable ground, facing it, still on foot; the car has not moved.
    const s = await state(page);
    const car = await carState(page);
    expect(car.active).toBe(false);
    expect(Math.hypot(car.x - parked.x, car.z - parked.z)).toBeLessThan(0.01);
    expect(await k3d(page, (k) => k.world.collision.isLoaded(k.player.position.x, k.player.position.z) && k.world.chunks.isReady(k.player.position.x, k.player.position.z))).toBe(true);
    expect(s.inBuilding).toBe(false);
    expect(s.inWater).toBe(false);
    expect(Math.abs(s.y - s.ground)).toBeLessThan(0.2);
    expect(await k3d(page, (k) => k.driving.canEnter(k.player))).toBe(true);
    const facing = await k3d(page, (k) => ({ heading: k.player.heading, yaw: k.tpc.yaw, x: k.player.position.x, z: k.player.position.z }));
    expect(Math.abs(wrap(facing.heading - Math.atan2(car.x - facing.x, car.z - facing.z)))).toBeLessThan(0.02);
    expect(Math.abs(wrap(facing.yaw - (facing.heading - Math.PI)))).toBeLessThan(0.02);
    await expect(page.locator('#toast')).toHaveText('Press E to enter car.');
    await expect(page.locator('#car-prompt')).toBeVisible();
    await expect(page.locator('#car-prompt')).toHaveText('EEnter Car');
    await expect(page.locator('#help')).toContainText('enter car');
    const after = await k3d(page, (k) => ({ disposed: k.world.chunks.stats.disposed, fetched: k.world.chunks.stats.fetched }));
    expect(after.fetched).toBeGreaterThan(before.fetched); // the car's area was streamed in
    await page.waitForTimeout(800);
    await shot(page, '04-drive-car-arrived');

    // E: in the car (now, not before).
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#car-prompt')).toHaveText('EExit Car');
    await expect(page.locator('#speedo')).toBeVisible();
    // While driving, the pause menu's Drive Car is unavailable.
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-drive')).toBeDisabled();
    await page.locator('#pause-resume').click();
    await page.keyboard.down('KeyW');
    await frames(page, 60);
    await page.keyboard.up('KeyW');
    await hudTick(page);
    await expect(page.locator('#car-prompt')).toBeHidden();
    await expect(page.locator('#speedo-gear')).toHaveText('D');
    await expect(page.locator('#help')).toContainText('handbrake');
    await shot(page, '05-hud-driving');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => (window as any).__k3d.driving.canExit, null, { timeout: 20_000 });
    await page.keyboard.up('Space');
    await frames(page, 3);
    await expect(page.locator('#car-prompt')).toHaveText('EExit Car');
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(false);
    await hudTick(page);
    await expect(page.locator('#help')).toContainText('jump');

    // Return to Waterfront, then Drive Car again from there; walking up to the car by hand still works too.
    await page.keyboard.press('Escape');
    await page.locator('#pause-reset').click();
    const sp = manifest.spawn;
    let at = await state(page);
    expect(Math.hypot(at.x - sp.x, at.z - sp.z)).toBeLessThan(1);
    await waitChunks(page);
    await page.keyboard.press('Escape');
    await page.locator('#pause-drive').click();
    await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });
    expect(await k3d(page, (k) => k.driving.canEnter(k.player) && !k.driving.active)).toBe(true);
    const c2 = await carState(page);
    at = await state(page);
    const away = [at.x + (at.x - c2.x) * 4, at.z + (at.z - c2.z) * 4];
    await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), away);
    await frames(page, 3);
    expect(await k3d(page, (k) => k.driving.canEnter(k.player))).toBe(false);
    const w = await walk(page, [[at.x, at.z]], { tolerance: 0.4, maxSeconds: 15 });
    expect(w.reached).toBe(true);
    await frames(page, 3);
    expect(await k3d(page, (k) => k.driving.canEnter(k.player))).toBe(true);
    expect(issues.errors).toEqual([]);
  });

  test('contextual controls: Inspect Shop, the car taking E when both are in reach, OP mode and back', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
    await waitChunks(page);

    // Near a shop only.
    const shop = await findShopSpot(page, false);
    expect(shop, 'a walkable spot near a mapped shop round Jalan China').not.toBeNull();
    await page.evaluate(({ x, z }) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, shop);
    await hudTick(page);
    await expect(page.locator('#place-prompt')).toBeVisible();
    await expect(page.locator('#place-prompt')).toContainText('Inspect Shop');
    await expect(page.locator('#car-prompt')).toBeHidden();
    await expect(page.locator('#help')).toContainText('inspect shop');
    await shot(page, '06-hud-shop');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#place-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#place-panel')).toBeHidden();

    // A shop and the car both in reach: the car's prompt is shown and E gets in.
    const both = await findShopSpot(page, true);
    expect(both, 'a car pose next to a shop').not.toBeNull();
    await placeCar(page, both.car.x, both.car.z, both.car.h);
    await page.evaluate(({ x, z }) => { const k = (window as any).__k3d; k.player.teleport(x, z); k.tpc.snap(); }, both.door);
    await hudTick(page);
    expect(await k3d(page, (k) => k.placePanel.nearShop && k.driving.canEnter(k.player))).toBe(true);
    await expect(page.locator('#car-prompt')).toHaveText('EEnter Car');
    await expect(page.locator('#place-prompt')).toBeHidden();
    await expect(page.locator('#help')).toContainText('enter car');
    await expect(page.locator('#help')).not.toContainText('inspect shop');
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#place-panel')).toBeHidden();

    // Driving -> OP mode: flying controls; the car prompt and the speedometer's E are out of the way.
    await page.keyboard.press('KeyP');
    await frames(page, 3);
    expect(await k3d(page, (k) => k.fly.active)).toBe(true);
    await expect(page.locator('#help')).toContainText('fly');
    await expect(page.locator('#help')).toContainText('exit OP mode');
    await expect(page.locator('#car-prompt')).toBeHidden();
    await shot(page, '07-hud-op-mode');
    await page.keyboard.press('KeyP');
    await frames(page, 3);
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#help')).toContainText('handbrake');
    await expect(page.locator('#car-prompt')).toHaveText('EExit Car');
    await page.keyboard.press('KeyE');
    expect((await carState(page)).active).toBe(false);
    await hudTick(page);
    await expect(page.locator('#help')).toContainText('jump');
    // On foot -> OP mode -> walking again.
    await page.keyboard.press('KeyP');
    await frames(page, 2);
    await expect(page.locator('#help')).toContainText('exit OP mode');
    await page.keyboard.press('KeyP');
    await frames(page, 2);
    await expect(page.locator('#help')).toContainText('jump');
    expect(issues.errors).toEqual([]);
  });
});
