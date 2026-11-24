// CHAR-P2a: version-agnostic regression test for the body-visibility bug. It only uses APIs that exist both on f1c9458
// and on the CHAR branch. Scenario: the character GLB is slow (20 s); the player gets into the car while the procedural
// stand-in is still shown; when the GLB finishes loading the new model must stay hidden inside the car.
import { test, expect } from '@playwright/test';
import { frames, start, waitChunks } from './helpers.ts';

test('regression: a character model finishing its load while driving stays hidden', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
  await page.route('**/casual-character.glb', async (route) => { await new Promise((r) => setTimeout(r, 20_000)); await route.continue(); });
  await page.goto('./?char=0');
  await start(page, { navigate: false });
  await waitChunks(page);
  await page.evaluate(() => { (window as any).__v0 = (window as any).__k3d.player.visual; });
  // Into the car through the pause menu (the same route as ui.spec).
  await page.keyboard.press('Escape');
  await page.locator('#pause-drive').click();
  await expect(page.locator('#pause')).toBeHidden({ timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__k3d.driving.canEnter((window as any).__k3d.player), null, { timeout: 30_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__k3d.driving.active === true, null, { timeout: 10_000 });
  expect(await page.evaluate(() => (window as any).__k3d.player.visual.root.visible)).toBe(false);
  // The GLB model replaces the stand-in.
  await page.waitForFunction(() => (window as any).__k3d.player.visual !== (window as any).__v0, null, { timeout: 60_000 });
  await frames(page, 10);
  const s = await page.evaluate(() => ({ visible: (window as any).__k3d.player.visual.root.visible, driving: (window as any).__k3d.driving.active }));
  expect(s, 'the body must stay hidden while driving').toEqual({ visible: false, driving: true });
  expect(errors).toEqual([]);
});
