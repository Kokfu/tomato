import { test, expect } from '@playwright/test';
import { watch, start, waitChunks } from './helpers.ts';

test.describe('layout', () => {
  test('start screen, HUD, settings, map and pause fit the viewport', async ({ page }, info) => {
    const issues = watch(page);
    await page.goto('./');
    await expect(page.locator('#start h1')).toHaveText('KUCHING 3D');
    await expect(page.locator('.tagline')).toHaveText('Explore the real streets of Kuching, Sarawak.');
    await expect(page.locator('#btn-start')).toHaveText('Start Exploring');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-start.png` });
    // Already on the page: navigating again would abort the downloads the first load still has in flight,
    // and those aborted requests would be reported as errors.
    await start(page, { navigate: false });
    await waitChunks(page);
    const vp = page.viewportSize()!;

    // The 3D canvas fills the screen and the page cannot scroll.
    const canvas = await page.locator('#scene').boundingBox();
    expect(Math.abs(canvas!.width - vp.width)).toBeLessThan(1);
    expect(Math.abs(canvas!.height - vp.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // HUD pieces are visible and inside the viewport.
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of ['location', 'minimap-wrap', 'btn-map', 'btn-settings', 'btn-pause', 'attribution']) {
      const loc = page.locator(`#${id}`);
      await expect(loc, id).toBeVisible();
      const b = (await loc.boundingBox())!;
      boxes[id] = b;
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.y, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height, id).toBeLessThanOrEqual(vp.height + 0.5);
    }
    const overlap = (a: any, b: any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap(boxes.location, boxes['minimap-wrap'])).toBe(false);
    // HUD panels must not cover a large share of the 3D view.
    const hudArea = boxes.location.width * boxes.location.height + boxes['minimap-wrap'].width * boxes['minimap-wrap'].height;
    expect(hudArea / (vp.width * vp.height)).toBeLessThan(0.2);
    await expect(page.locator('#attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('#loc-coords')).toHaveText(/\d+\.\d{5}.N\s+\d+\.\d{5}.E/);

    // The scene is actually rendering 3D content (not a blank canvas).
    const render = await page.evaluate(() => (window as any).__k3d.renderer.info.render);
    expect(render.triangles).toBeGreaterThan(3000);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-hud.png` });

    // Settings: switch quality presets; geography (player position) is unaffected.
    const pos0 = await page.evaluate(() => (window as any).__k3d.player.position.toArray());
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings')).toBeVisible();
    const card = (await page.locator('#settings .modal-card').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(vp.width + 0.5);
    for (const q of ['low', 'high', 'medium']) {
      await page.locator(`#quality-seg [data-q="${q}"]`).click();
      await expect(page.locator(`#quality-seg [data-q="${q}"]`)).toHaveClass(/active/);
      await waitChunks(page);
    }
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-settings.png` });
    await page.locator('#settings-close').click();
    await expect(page.locator('#settings')).toBeHidden();
    const pos1 = await page.evaluate(() => (window as any).__k3d.player.position.toArray());
    expect(Math.hypot(pos1[0] - pos0[0], pos1[2] - pos0[2])).toBeLessThan(0.01);

    // Map opens and closes; gameplay input is suspended while it is open.
    await page.locator('#btn-map').click();
    await expect.poll(() => page.evaluate(() => (window as any).__k3d.minimap.fullOpen)).toBe(true);
    expect(await page.evaluate(() => (window as any).__k3d.input.enabled)).toBe(false);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-map.png` });
    await page.evaluate(() => (window as any).__k3d.minimap.toggleFullMap());
    await expect.poll(() => page.evaluate(() => (window as any).__k3d.input.enabled)).toBe(true);

    // Pause and resume.
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__k3d.input.enabled)).toBe(false);
    await page.locator('#pause-resume').click();
    await expect(page.locator('#pause')).toBeHidden();
    expect(issues.errors).toEqual([]);
  });
});
