// N1-M7 the play loop on the emulated phone (mobile-390 / mobile-360: Chromium touch emulation, not a real phone).
// A new player, by touch only for everything on the screen: pause > Drive Car, Enter Car, the phone button, a delivery
// offer; the driving itself goes through the same Input path as the touch pedals (driveRoute), as in touch-drive.spec.
import { test, expect } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { watch, start, frames } from './helpers.ts';
import { carState, driveRoute } from './driving-helpers.ts';
import { CHINA } from '../../src/v5/geo.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const CHINA_LANE: [number, number][] = ([[60, 0], [30, 0], [-4.5, 0], [-3.5, 8], [-3, 14]] as [number, number][]).map(([s, o]) => CHINA.toWorld(s, o));
type Pt = { x: number; y: number; id: number };
const send = (cdp: CDPSession, type: 'touchStart' | 'touchEnd', pts: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
const centre = async (page: Page, sel: string): Promise<{ x: number; y: number }> => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** HUD pieces that must not overlap each other on the phone, on foot and at the wheel, with a job in hand. */
const HUD = ['location', 'wallet', 'minimap-wrap', 'topbar', 'minimap-ctl', 'nav-hint', 'speedo', 'gps-btn', 'steer-pad', 'btn-gas', 'btn-brake', 'btn-hb', 'btn-exit', 'btn-cam', 'btn-reset', 'btn-horn', 'joystick', 'btn-run', 'btn-jump', 'car-prompt', 'attribution'];
const overlaps = (page: Page) => page.evaluate((ids) => {
  const vw = innerWidth, vh = innerHeight, out: string[] = [];
  const rects = ids.map((id) => { const e = document.getElementById(id), r = e?.getBoundingClientRect(); return [id, r && r.width && r.height && e!.checkVisibility() ? r : null] as const; }).filter(([, r]) => r) as [string, DOMRect][];
  const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const [id, r] of rects) if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`${id} outside ${vw}x${vh}`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (hit(rects[i][1], rects[j][1])) out.push(`${rects[i][0]} x ${rects[j][0]}`);
  return out;
}, HUD);

test.describe('N1-M7 play loop by touch', () => {
  test('a new player on a phone finishes a food delivery; the phone, the wallet and the horn fit the screen', async ({ page }) => {
    test.setTimeout(720_000);
    const issues = watch(page);
    await start(page);
    const cdp = await page.context().newCDPSession(page);
    await page.waitForFunction(() => { const k = (window as any).__k3d; return k.driving.placed && k.life?.active; }, null, { timeout: 60_000 });
    await k3d(page, (k) => k.play.seed(20261126));
    expect(await k3d(page, (k) => [document.body.classList.contains('touch'), k.life.budget.parked])).toEqual([true, 6]);
    await expect(page.locator('#wallet-money')).toHaveText('RM 0.00');
    await expect(page.locator('#btn-phone')).toBeVisible();
    expect(await overlaps(page)).toEqual([]);

    // to the car by the pause menu, in by the prompt
    await page.locator('#btn-pause').tap();
    await page.locator('#pause-drive').tap();
    await expect(page.locator('#car-prompt')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#car-prompt')).toContainText('Enter Car');
    expect(await overlaps(page)).toEqual([]);
    await page.locator('#car-prompt').tap();
    await frames(page, 3);
    expect((await carState(page)).active).toBe(true);
    await expect(page.locator('#toast')).toContainText('phone button');
    await expect(page.locator('#btn-horn')).toBeVisible();
    expect(await overlaps(page)).toEqual([]);

    // the horn is a held touch button; it lets go with the finger
    const h = await centre(page, '#btn-horn');
    await send(cdp, 'touchStart', [{ ...h, id: 7 }]);
    await frames(page, 4);
    expect(await k3d(page, (k) => [k.play.sfx.played.horn, k.play.hornHeld])).toEqual([1, true]);
    await send(cdp, 'touchEnd', []);
    await frames(page, 4);
    expect(await k3d(page, (k) => k.play.hornHeld)).toBe(false);

    // the phone: it fits the screen above the driving controls, and takes taps
    await page.locator('#btn-phone').tap();
    await expect(page.locator('#phone')).toBeVisible();
    const box = (await page.locator('#phone').boundingBox())!, vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    // (nothing of the touch controls lies over a phone button)
    for (const id of ['ph-delivery', 'ph-taxi', 'ph-garage', 'ph-save']) {
      const top = await page.evaluate((id) => { const r = document.getElementById(id)!.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button')?.id ?? ''; }, id);
      expect(top).toBe(id);
    }
    expect(await k3d(page, (k) => [k.input.enabled, k.mobile.holding])).toEqual([false, false]);
    await page.locator('#ph-delivery').tap();
    await expect(page.locator('.ph-offer').first()).toBeVisible({ timeout: 30_000 });
    const job = await k3d(page, (k) => ({ fare: k.play.offersShown[0].fare, trip: k.play.offersShown[0].trip }));
    await page.locator('.ph-offer').first().tap();
    await expect(page.locator('#phone')).toBeHidden();
    await expect(page.locator('#wallet-job')).toContainText('collect at a restaurant');
    await page.waitForFunction(() => { const n = (window as any).__k3d.minimap.nav; return n && n.target.id === 'job-goal' && n.mode === 'drive' && !!n.route; }, null, { timeout: 20_000 });
    await expect(page.locator('#nav-hint')).toBeVisible();
    expect(await overlaps(page)).toEqual([]);

    const follow = async (stage: 'pickup' | 'dropoff') => {
      for (let leg = 0; leg < 8; leg++) {
        const pts = await k3d(page, (k) => {
          const n = k.minimap.nav, car = k.driving.car;
          if (!n || n.target.id !== 'job-goal' || !n.route) return null;
          const r = n.route, out: [number, number][] = [];
          let best = 0, bd = Infinity;
          for (let i = 0; i < r.points.length; i += 2) { const d = Math.hypot(r.points[i] - car.x, r.points[i + 1] - car.z); if (d < bd) { bd = d; best = i; } }
          for (let i = best + 2; i < r.points.length; i += 2) out.push([r.points[i], r.points[i + 1]]);
          return out;
        });
        if (!pts) { await page.waitForTimeout(500); continue; }
        if (pts.length) await driveRoute(page, pts, { speed: 9, speedup: 3, tolerance: 6, maxSeconds: 420 });
        if (await page.waitForFunction((stage) => { const j = (window as any).__k3d.play.job; return !j || j.stage !== stage; }, stage, { timeout: 4000 }).then(() => true, () => false)) return;
      }
      throw new Error(`the ${stage} was not reached: ${JSON.stringify(await carState(page))}`);
    };
    expect((await driveRoute(page, CHINA_LANE, { speed: 6, speedup: 3, maxSeconds: 120 })).reached).toBe(true);
    await follow('pickup');
    await expect(page.locator('#wallet-job')).toContainText('take to');
    expect(await overlaps(page)).toEqual([]);
    await follow('dropoff');

    const end = await k3d(page, (k) => ({ money: k.play.money, paid: k.play.paid.length, job: k.play.job, saved: localStorage.getItem('k3d.save') }));
    expect(end.job).toBeNull();
    expect(end.paid).toBe(1);
    expect(end.money).toBeGreaterThanOrEqual(job.fare);
    await expect(page.locator('#wallet-money')).toHaveText(`RM ${end.money.toFixed(2)}`);
    expect(JSON.parse(end.saved!)).toMatchObject({ v: 1, money: end.money, delivery: 1 });

    // save by hand from the phone, by touch
    await page.locator('#btn-phone').tap();
    await page.locator('#ph-save').tap();
    await expect(page.locator('#ph-note')).toHaveText('Saved on this device.');
    await expect(page.locator('#ph-money')).toHaveText(`RM ${end.money.toFixed(2)}`);
    await page.locator('#phone .ph-close').tap();
    await expect(page.locator('#phone')).toBeHidden();
    expect(issues.errors).toEqual([]);
  });
});
