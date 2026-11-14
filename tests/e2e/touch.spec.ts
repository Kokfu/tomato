import { test, expect } from '@playwright/test';
import type { CDPSession } from '@playwright/test';
import { watch, start, state, waitChunks } from './helpers.ts';

type Pt = { x: number; y: number; id: number };
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
}

test.describe('touch', () => {
  test('virtual joystick moves, drag rotates the camera, page never scrolls', async ({ page }, info) => {
    const issues = watch(page);
    await start(page);
    await waitChunks(page);
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#btn-run')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const joy = (await page.locator('#joystick').boundingBox())!;
    const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2;

    // Face west along the promenade (open ground), then push the stick forward.
    await page.evaluate(() => { (window as any).__k3d.tpc.yaw = Math.PI / 2; });
    const a = await state(page);
    await touch(cdp, 'touchStart', [{ x: cx, y: cy, id: 1 }]);
    for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: cx, y: cy - i * 9, id: 1 }]);
    await page.waitForTimeout(1500);
    const b = await state(page);
    expect(b.speed).toBeGreaterThan(1.5);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1.5);
    expect(b.x).toBeLessThan(a.x - 1); // moved west = camera forward

    // A second finger drags on the 3D view to rotate the camera while still walking.
    const vp = page.viewportSize()!;
    const yaw0 = await page.evaluate(() => (window as any).__k3d.tpc.yaw);
    const sx = vp.width * 0.7, sy = vp.height * 0.4;
    await touch(cdp, 'touchStart', [{ x: cx, y: cy - 54, id: 1 }, { x: sx, y: sy, id: 2 }]);
    for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: cx, y: cy - 54, id: 1 }, { x: sx - i * 12, y: sy + i * 2, id: 2 }]);
    await page.waitForTimeout(100);
    const yaw1 = await page.evaluate(() => (window as any).__k3d.tpc.yaw);
    expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.2);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}-touch.png` });
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(700);
    expect((await state(page)).speed).toBeLessThan(0.3); // releasing the stick stops the character

    // Run toggle.
    const run = (await page.locator('#btn-run').boundingBox())!;
    await touch(cdp, 'touchStart', [{ x: run.x + run.width / 2, y: run.y + run.height / 2, id: 3 }]);
    await touch(cdp, 'touchEnd', []);
    expect(await page.evaluate(() => (window as any).__k3d.input.touchRun)).toBe(true);
    await expect(page.locator('#btn-run')).toHaveClass(/active/);

    // A long vertical swipe must not scroll or zoom the page.
    await touch(cdp, 'touchStart', [{ x: vp.width / 2, y: vp.height * 0.75, id: 4 }]);
    for (let i = 1; i <= 10; i++) await touch(cdp, 'touchMove', [{ x: vp.width / 2, y: vp.height * 0.75 - i * 40, id: 4 }]);
    await touch(cdp, 'touchEnd', []);
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1 }));
    expect(scroll).toEqual({ x: 0, y: 0, scale: 1 });
    expect(issues.errors).toEqual([]);
  });
});
