import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, state, frames, landmarks, CHUNK } from './helpers.ts';

const fly = (page: Page) => page.evaluate(() => {
  const f = (window as any).__k3d.fly;
  return { active: f.active as boolean, x: f.position.x as number, y: f.position.y as number, z: f.position.z as number, yaw: f.yaw as number, pitch: f.pitch as number, speedIndex: f.speedIndex as number, pending: !!f.pending };
});
const holdFor = async (page: Page, codes: string[], n: number) => {
  for (const c of codes) await page.keyboard.down(c);
  await frames(page, n);
  for (const c of codes) await page.keyboard.up(c);
};

test.describe('OP fly mode', () => {
  test('is off by default; P and the button toggle it; walking resumes from the same place', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    expect((await fly(page)).active).toBe(false);
    await expect(page.locator('#op-panel')).toBeHidden();
    const before = await state(page);

    await page.keyboard.press('KeyP');
    expect((await fly(page)).active).toBe(true);
    await expect(page.locator('#op-panel')).toBeVisible();
    await expect(page.locator('#op-readout')).toContainText('Altitude');

    // Fly: forward at 25 m/s for one second, then up and down, then the speed keys.
    await page.evaluate(() => { const f = (window as any).__k3d.fly; f.pitch = 0; f.yaw = 0; });
    const a = await fly(page);
    await holdFor(page, ['KeyW'], 60);
    const b = await fly(page);
    expect(a.z - b.z).toBeGreaterThan(18);
    expect(a.z - b.z).toBeLessThan(26);
    await holdFor(page, ['Space'], 60);
    const c = await fly(page);
    expect(c.y - b.y).toBeGreaterThan(15);
    await holdFor(page, ['ControlLeft'], 30);
    const d = await fly(page);
    expect(d.y).toBeLessThan(c.y - 5);
    await page.keyboard.press('Digit3');
    expect((await fly(page)).speedIndex).toBe(2);
    await frames(page, 30);
    const e0 = await fly(page);
    await holdFor(page, ['KeyW', 'ShiftLeft'], 30); // 150 m/s, boosted to 300
    const e1 = await fly(page);
    expect(e0.z - e1.z).toBeGreaterThan(100);
    await page.locator('#op-panel .op-row button').first().click();
    expect((await fly(page)).speedIndex).toBe(0);

    // Mouse look (drag fallback; pointer lock is not available to the test browser).
    await page.mouse.move(700, 500);
    await page.mouse.down();
    await page.mouse.move(900, 440, { steps: 12 });
    await page.mouse.up();
    await frames(page, 3);
    const m = await fly(page);
    expect(m.yaw).toBeLessThan(e1.yaw - 0.1);
    expect(m.pitch).toBeGreaterThan(e1.pitch + 0.05);

    // No gravity, no collision: the camera can go below the terrain and stays where it is put.
    await page.evaluate(() => { const f = (window as any).__k3d.fly; f.position.y = -20; f.velocity.set(0, 0, 0); });
    await frames(page, 30);
    expect((await fly(page)).y).toBeCloseTo(-20, 0);

    // The walking character did not move while flying.
    const during = await state(page);
    expect(Math.hypot(during.x - before.x, during.z - before.z)).toBeLessThan(0.01);

    // The drag engaged pointer lock where the browser grants it: T frees the mouse for the panel.
    await page.keyboard.press('KeyT');
    await frames(page, 3);
    await page.locator('#op-exit').click();
    expect((await fly(page)).active).toBe(false);
    await expect(page.locator('#op-panel')).toBeHidden();
    // Normal walking, gravity and collision again.
    await page.evaluate(() => { (window as any).__k3d.tpc.yaw = Math.PI / 2; });
    await holdFor(page, ['KeyW'], 90);
    const after = await state(page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.8);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(4);
    expect(after.grounded).toBe(true);
    expect(Math.abs(after.y - after.ground)).toBeLessThan(0.05);
    expect(after.inBuilding).toBe(false);
    await page.locator('#op-toggle').click();
    expect((await fly(page)).active).toBe(true);
    await page.keyboard.press('KeyP');
    expect((await fly(page)).active).toBe(false);
    expect(issues.errors).toEqual([]);
  });

  test('travels to landmarks after loading their chunk, and can put the character down there', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const home = await state(page);
    for (const id of ['dun', 'darul-hana', 'lau-ya-keng-food-court', 'hiang-thian-siang-ti-temple', 'tua-pek-kong', 'fort-margherita', 'astana', 'waterfront', 'the-spring']) {
      const lm = landmarks().find((l) => l.id === id)!;
      expect(lm, id).toBeTruthy();
      await page.locator(`#op-landmarks button[data-lm="${id}"]`).evaluate((b) => (b as HTMLElement).click());
      await page.waitForFunction(() => !(window as any).__k3d.fly.pending, null, { timeout: 30_000 });
      const f = await fly(page);
      expect(f.active).toBe(true);
      // The camera arrives south of the mapped landmark position, and its chunk is built.
      expect(Math.hypot(f.x - lm.x, f.z - lm.z), id).toBeLessThan(260);
      expect(await page.evaluate(([x, z]) => (window as any).__k3d.world.chunks.isReady(x, z), [lm.x, lm.z]), id).toBe(true);
      await frames(page, 15);
      await expect(page.locator('#op-readout')).toContainText('Near: ');
    }
    // "Near" names the landmark when the camera is over it.
    const dun = landmarks().find((l) => l.id === 'dun')!;
    await page.locator('#op-landmarks button[data-lm="dun"]').evaluate((b) => (b as HTMLElement).click());
    await page.waitForFunction(() => !(window as any).__k3d.fly.pending, null, { timeout: 30_000 });
    await page.evaluate(([x, z]) => { const f = (window as any).__k3d.fly; f.position.x = x; f.position.z = z; }, [dun.x, dun.z]);
    await frames(page, 20);
    await expect(page.locator('#op-readout')).toContainText('Legislative Assembly');
    // Over the building: the character cannot be put down. On the open ground south-east of it: it can.
    await page.locator('#op-walk').click();
    expect((await fly(page)).active).toBe(true);
    expect(Math.hypot((await state(page)).x - home.x, (await state(page)).z - home.z)).toBeLessThan(0.01);
    await page.evaluate(([x, z]) => { const f = (window as any).__k3d.fly; f.position.x = x + 75; f.position.z = z + 75; }, [dun.x, dun.z]);
    await frames(page, 5);
    await page.locator('#op-walk').click();
    expect((await fly(page)).active).toBe(false);
    await frames(page, 10);
    const s = await state(page);
    expect(Math.hypot(s.x - (dun.x + 75), s.z - (dun.z + 75))).toBeLessThan(1);
    expect(s.grounded).toBe(true);
    expect(s.inWater).toBe(false);
    expect(s.inBuilding).toBe(false);
    expect(issues.errors).toEqual([]);
  });

  test('fast flight across chunk borders keeps streaming', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await page.evaluate(() => { const k = (window as any).__k3d; k.setSimulatedDt(1 / 60); k.fly.travelTo('dun'); });
    await page.waitForFunction(() => !(window as any).__k3d.fly.pending, null, { timeout: 30_000 });
    // Head west at 150 m/s, 120 m up, for 12 simulated seconds (about seven chunks).
    await page.evaluate(() => { const f = (window as any).__k3d.fly; f.setSpeed(2); f.yaw = Math.PI / 2; f.pitch = 0; f.position.y = 120; });
    const a = await fly(page);
    await page.keyboard.down('KeyW');
    const res = await page.evaluate(() => new Promise<{ ready: number; n: number; maxBuild: number }>((resolve) => {
      const k = (window as any).__k3d;
      let n = 0, ready = 0;
      k.world.chunks.stats.maxBuildMs = 0;
      const tick = () => {
        n++;
        if (k.world.chunks.isReady(k.fly.position.x, k.fly.position.z)) ready++;
        if (n >= 720) resolve({ ready, n, maxBuild: k.world.chunks.stats.maxBuildMs });
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.up('KeyW');
    const b = await fly(page);
    console.log(`fast flight: ${(a.x - b.x).toFixed(0)} m west, chunk under camera built on ${((res.ready / res.n) * 100).toFixed(0)}% of frames, max chunk build ${res.maxBuild.toFixed(1)} ms`);
    expect(a.x - b.x).toBeGreaterThan(5 * CHUNK);
    // The chunk under the camera is nearly always there on arrival (downloads run ahead of the camera).
    expect(res.ready / res.n).toBeGreaterThan(0.6);
    // Stop: everything around the camera finishes loading.
    await page.waitForFunction(() => { const k = (window as any).__k3d; return k.world.chunks.isReady(k.fly.position.x, k.fly.position.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 90_000 });
    // Leaving the mode far from the character: its area streams back in and walking works.
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => { const k = (window as any).__k3d, p = k.player.position; return k.world.chunks.isReady(p.x, p.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 90_000 });
    const s0 = await state(page);
    await holdFor(page, ['KeyW'], 90);
    const s1 = await state(page);
    expect(Math.hypot(s1.x - s0.x, s1.z - s0.z)).toBeGreaterThan(0.8);
    expect(s1.grounded).toBe(true);
    expect(issues.errors).toEqual([]);
  });
});
