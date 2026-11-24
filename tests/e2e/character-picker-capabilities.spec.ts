// CHAR-P5 G2: each of the six characters, chosen through the first-launch picker, still walks, runs, jumps, drives, uses GPS and flies.
// (Simulated 1/60 s frames, like gameplay.spec, so a slow frame cannot change a distance.)
import { test, expect } from '@playwright/test';
import { start, state, teleport, waitChunks, frames, landmarks } from './helpers.ts';
import { carState } from './driving-helpers.ts';

const SIX = ['man', 'woman', 'teen-boy', 'teen-girl', 'young-boy', 'young-girl'];
const DEV_NOISE = /WebSocket|\[vite\]|Vite server/;

test.describe.configure({ mode: 'serial' });

for (const id of SIX) {
  test(`${id}: picked on first launch, then walks, runs, jumps, drives, routes (GPS) and flies`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !DEV_NOISE.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => { if (!DEV_NOISE.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); localStorage.removeItem('k3d.character'); } catch { /* ignore */ } });
    await page.goto('./?char');
    await start(page, { navigate: false });
    await expect(page.locator('#char-picker')).toBeVisible({ timeout: 60_000 });
    await page.locator(`#char-picker [role=radio][data-id=${id}]`).click();
    await page.locator('#pk-confirm').click();
    await expect(page.locator('#char-picker')).toBeHidden({ timeout: 60_000 });
    await page.waitForFunction((id) => { const c = (window as any).__k3d.character; return c.id === id && !c.loading && !c.fallback; }, id, { timeout: 60_000 });
    expect(await page.evaluate(() => localStorage.getItem('k3d.character'))).toBe(id);

    const mb = landmarks().find((l) => l.id === 'main-bazaar')!;
    await teleport(page, mb.x, mb.z);
    await waitChunks(page);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    const dir = async (code: string, ms: number, shift = false) => {
      await teleport(page, mb.x, mb.z);
      await page.evaluate(() => { const k = (window as any).__k3d; k.tpc.yaw = 0; k.player.velocity.set(0, 0, 0); });
      const a = await state(page);
      if (shift) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down(code);
      await frames(page, Math.round((ms / 1000) * 60));
      const mid = await state(page);
      await page.keyboard.up(code);
      if (shift) await page.keyboard.up('ShiftLeft');
      return { dx: mid.x - a.x, dz: mid.z - a.z, speed: mid.speed };
    };
    // walk (V2 pacing: 1.6 m/s) and run (5.2 m/s)
    const w = await dir('KeyW', 900);
    expect(w.dz, 'walk north').toBeLessThan(-0.8);
    expect(w.speed).toBeGreaterThan(1.3); expect(w.speed).toBeLessThan(1.8);
    const r = await dir('KeyD', 1200, true);
    expect(r.dx, 'run east').toBeGreaterThan(3);
    expect(r.speed).toBeGreaterThan(4.6); expect(r.speed).toBeLessThan(5.4);
    // jump
    await teleport(page, mb.x, mb.z);
    const g0 = await state(page);
    await page.keyboard.press('Space');
    await frames(page, 13);
    const up = await state(page);
    expect(up.y).toBeGreaterThan(g0.y + 0.3);
    expect(up.grounded).toBe(false);
    await frames(page, 54);
    const down = await state(page);
    expect(down.grounded).toBe(true);
    expect(Math.abs(down.y - down.ground)).toBeLessThan(0.05);
    // GPS on foot
    const nav = await page.evaluate(async () => { const n = await (window as any).__k3d.minimap.routeTo('waterfront', 'walk'); return { ok: !!n, hasRoute: !!(window as any).__k3d.minimap.nav?.route }; });
    expect(nav.hasRoute, 'walking route found').toBe(true);
    await page.evaluate(() => (window as any).__k3d.minimap.cancelNav?.() ?? (window as any).__k3d.minimap.clearNav?.());
    // body visibility rule is the same for every character: hidden in the car, visible on foot and in fly mode
    const vis = () => page.evaluate(() => (window as any).__k3d.player.visual.root.visible as boolean);
    expect(await vis()).toBe(true);
    // fly (P)
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => (window as any).__k3d.fly.active === true, null, { timeout: 10_000 });
    const f0 = await page.evaluate(() => { const f = (window as any).__k3d.fly; f.pitch = 0; f.yaw = 0; return { x: f.position.x, z: f.position.z }; });
    await page.keyboard.down('KeyW'); await frames(page, 60); await page.keyboard.up('KeyW');
    const f1 = await page.evaluate(() => { const f = (window as any).__k3d.fly; return { x: f.position.x, z: f.position.z }; });
    expect(Math.hypot(f1.x - f0.x, f1.z - f0.z), 'fly moved').toBeGreaterThan(5);
    expect(await vis(), 'the avatar stays visible where it stands in fly mode (bodyVisible rule)').toBe(true);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => (window as any).__k3d.fly.active === false, null, { timeout: 10_000 });
    expect(await vis()).toBe(true);
    // drive (pause menu -> car, E to get in, W to move, E to get out)
    await page.keyboard.press('Escape');
    await page.locator('#pause-drive').click();
    await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__k3d.driving.active === true, null, { timeout: 10_000 });
    const c0 = await carState(page);
    await page.keyboard.down('KeyW'); await frames(page, 120); await page.keyboard.up('KeyW');
    const c1 = await carState(page);
    expect(Math.hypot(c1.x - c0.x, c1.z - c0.z), 'car moved').toBeGreaterThan(2);
    expect(await vis(), 'hidden while driving').toBe(false);
    await page.keyboard.down('Space'); // handbrake: the car has to be (nearly) stopped to get out
    await page.waitForFunction(() => (window as any).__k3d.driving.canExit === true, null, { timeout: 20_000 });
    await page.keyboard.up('Space');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__k3d.driving.active === false, null, { timeout: 10_000 });
    expect(await vis()).toBe(true);
    expect(errors).toEqual([]);
  });
}
