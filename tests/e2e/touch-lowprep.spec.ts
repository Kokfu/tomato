// V8.6 on the emulated phone (mobile-390 / mobile-360: Chromium touch emulation, not a real phone), Low preset:
// rotating the phone while driving must not change the shader program variants (the V8.5 stall trigger), pinch
// zooms the chase camera, and sending the page to the background pauses the game with nothing held, after which
// driving resumes without compiling anything.
import { test, expect } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { watch, start, frames } from './helpers.ts';
import { carState } from './driving-helpers.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number; id: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, radiusX: 8, radiusY: 8, force: 1 })) });
const programs = (page: Page) => k3d(page, (k) => k.renderer.info.programs.length as number);
/** Turn the chase camera once round the car (90 frames), so everything around the car is drawn. */
const lookRound = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  const cam = (window as any).__k3d.driving.camera, y0 = cam.yaw;
  let i = 0;
  const tick = () => { cam.yaw = y0 + (i / 90) * Math.PI * 2; if (++i > 90) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));

test('Low on a phone: rotation keeps shader variants, pinch zooms, backgrounding pauses and resumes cleanly', async ({ page, context }) => {
  const issues = watch(page);
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
  await start(page);
  expect(await k3d(page, (k) => k.world.chunks.quality.name)).toBe('low');
  const cdp = await context.newCDPSession(page);
  const tap = async (sel: string) => {
    const b = (await page.locator(sel).boundingBox())!;
    await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    await frames(page, 2);
  };
  // Into the car by touch.
  await page.evaluate(() => { const k = (window as any).__k3d, c = k.driving.car; k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9); k.tpc.snap(); });
  await expect(page.locator('#car-prompt')).toBeVisible();
  await tap('#car-prompt');
  await expect.poll(() => carState(page).then((c) => c.active)).toBe(true);
  await lookRound(page);
  await frames(page, 10);
  const p0 = await programs(page);

  // Rotate to landscape and back: the shadow state and therefore every program variant stay as they were.
  const portrait = page.viewportSize()!;
  for (const size of [{ width: portrait.height, height: portrait.width }, portrait]) {
    await page.setViewportSize(size);
    await frames(page, 10);
    expect(await k3d(page, (k) => k.renderer.shadowMap.enabled)).toBe(false);
    await lookRound(page);
    expect(await programs(page)).toBe(p0);
    await expect(page.locator('#btn-gas')).toBeVisible();
  }

  // Pinch out on the 3D view (two fingers moving apart): the chase camera comes closer.
  const d0 = await k3d(page, (k) => k.driving.camera.distance as number);
  const vp = page.viewportSize()!, cx = vp.width / 2, cy = vp.height * 0.3;
  await touch(cdp, 'touchStart', [{ x: cx - 30, y: cy, id: 5 }, { x: cx + 30, y: cy, id: 6 }]);
  for (let s = 1; s <= 6; s++) { await touch(cdp, 'touchMove', [{ x: cx - 30 - s * 15, y: cy, id: 5 }, { x: cx + 30 + s * 15, y: cy, id: 6 }]); await frames(page, 1); }
  await touch(cdp, 'touchEnd', []);
  await frames(page, 30);
  expect(await k3d(page, (k) => k.driving.camera.distance as number)).toBeLessThan(d0 - 0.2);

  // Background the page while a finger holds the gas: the game pauses and the pedal is released.
  const gas = (await page.locator('#btn-gas').boundingBox())!;
  await touch(cdp, 'touchStart', [{ x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 9 }]);
  await frames(page, 5);
  expect(await k3d(page, (k) => k.input.touchY)).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await frames(page, 3);
  await expect(page.locator('#pause')).toBeVisible();
  expect(await k3d(page, (k) => k.input.touchY)).toBe(0);
  await touch(cdp, 'touchEnd', []);
  // Back to the foreground and resume: still in the car, drawing, nothing compiled.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await tap('#pause-resume');
  await expect(page.locator('#pause')).toBeHidden();
  await frames(page, 10);
  expect((await carState(page)).active).toBe(true);
  expect(await k3d(page, (k) => k.renderer.info.render.calls)).toBeGreaterThan(0);
  expect(await programs(page)).toBe(p0);
  expect(issues.errors).toEqual([]);
});
