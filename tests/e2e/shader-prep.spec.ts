// V8.6: shader programs are prepared for the variant that is actually drawn (src/world/prepareDraw.ts).
// Until V8.5 the Low preset turned shadows on for the default V7 rendering and the next resize turned them off
// again, so every prepared program had to be compiled a second time when first drawn (multi-second freezes on a
// throttled phone profile). These checks run on the desktop project; the resize to phone size is the trigger.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, frames, waitChunks } from './helpers.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;

test.describe('V8.6 shader preparation', () => {
  test('Low: shadows stay off across a resize, and a look round at the spawn compiles no new program', async ({ page }) => {
    const issues = watch(page);
    await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
    await start(page);
    expect(await k3d(page, (k) => k.world.chunks.quality.name)).toBe('low');
    expect(await k3d(page, (k) => k.v5.mode)).toBe('c');
    const shadowState = () => k3d(page, (k) => ({ renderer: k.renderer.shadowMap.enabled, sun: k.world.sun.castShadow }));
    expect(await shadowState()).toEqual({ renderer: false, sun: false });
    // The resize (phone portrait, as an orientation change or an adaptive-resolution step would do) must not change
    // the shadow state, and so not the program variants.
    await page.setViewportSize({ width: 390, height: 844 });
    await frames(page, 10);
    expect(await shadowState()).toEqual({ renderer: false, sun: false });
    await waitChunks(page);
    await frames(page, 30);
    const before = await k3d(page, (k) => k.renderer.info.programs.length);
    // Look round 360 degrees at the spawn (the Jalan China section, its landmarks, the parked car).
    await page.evaluate(() => new Promise<void>((resolve) => {
      const k = (window as any).__k3d, y0 = k.tpc.yaw;
      let i = 0;
      const tick = () => { k.tpc.yaw = y0 + (i / 90) * Math.PI * 2; if (++i > 90) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    await frames(page, 5);
    expect(await k3d(page, (k) => k.renderer.info.programs.length)).toBe(before);
    expect(issues.errors).toEqual([]);
  });

  test('Low -> Medium -> Low: shadows follow the preset and drawing resumes after the new programs compile', async ({ page }) => {
    const issues = watch(page);
    await page.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
    await start(page);
    const calls = () => k3d(page, (k) => k.renderer.info.render.calls);
    for (const [q, shadows] of [['medium', true], ['low', false]] as const) {
      await page.evaluate((q) => (document.querySelector(`#quality-seg button[data-q="${q}"]`) as HTMLButtonElement).click(), q);
      expect(await k3d(page, (k) => k.renderer.shadowMap.enabled)).toBe(shadows);
      // The last frame is held while the new variants compile (at most 3 s), then the scene is drawn again.
      await page.waitForFunction(() => (window as any).__k3d.renderer.info.render.calls > 0, null, { timeout: 10_000 });
      await frames(page, 3);
      expect(await calls()).toBeGreaterThan(0);
      expect(await k3d(page, (k) => k.renderer.shadowMap.enabled)).toBe(shadows);
    }
    expect(issues.errors).toEqual([]);
  });
});
