// V8.5 mobile driving: touch pedals and steering through the shared Input path, multitouch, release of held controls
// after every kind of interruption, GPS by touch only, and a HUD overlap sweep over phone and tablet sizes.
// Runs in the mobile-390 and mobile-360 projects (Chromium touch emulation, not a real phone).
import { test, expect } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { watch, start, frames } from './helpers.ts';
import { carState } from './driving-helpers.ts';

const SHOTS = 'docs/screenshots/v8.5-mobile';
type Pt = { x: number; y: number; id: number };
const send = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', pts: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
const centre = async (page: Page, sel: string, fx = 0.5): Promise<{ x: number; y: number }> => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width * fx, y: b.y + b.height / 2 };
};
const touchIn = (page: Page) => page.evaluate(() => {
  const i = (window as any).__k3d.input;
  return { x: i.touchX, y: i.touchY, hb: i.touchHandbrake, moveX: i.moveX, moveY: i.moveY, handbrake: i.handbrake };
});
const idle = { x: 0, y: 0, hb: false };
/**
 * One finger lifts while others stay down. CDP's dispatchTouchEvent can only lift every finger at once (touchEnd
 * carries no points), so this one is a page-level TouchEvent with the real identifiers, as a browser sends it.
 */
const liftOne = (page: Page, lift: { id: number; sel: string }, keep: { id: number; sel: string }[]) => page.evaluate(({ lift, keep }) => {
  const mk = (p: { id: number; sel: string }) => {
    const el = document.querySelector(p.sel)!, r = el.getBoundingClientRect();
    return new Touch({ identifier: p.id, target: el, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  };
  const t = mk(lift);
  t.target.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t], touches: keep.map(mk), bubbles: true, cancelable: true }));
}, { lift, keep });
const metres = (s: string): number | null => {
  const m = /([\d.]+) (m|km)\b/.exec(s);
  return m ? +m[1] * (m[2] === 'km' ? 1000 : 1) : null;
};

/** HUD pieces that must never overlap each other while driving on touch. */
const DRIVE_HUD = ['location', 'minimap-wrap', 'topbar', 'minimap-ctl', 'nav-hint', 'speedo', 'gps-btn', 'steer-pad', 'btn-gas', 'btn-brake', 'btn-hb', 'btn-exit', 'btn-cam', 'btn-reset', 'btn-horn', 'wallet', 'attribution', 'toast', 'chunk-loading'];
const SIZES: [number, number][] = [[360, 800], [390, 844], [430, 932], [768, 1024], [800, 360], [844, 390], [932, 430]];

async function layoutIssues(page: Page, withPanel: boolean): Promise<string[]> {
  return page.evaluate(({ ids, withPanel }) => {
    const vw = innerWidth, vh = innerHeight, out: string[] = [];
    const box = (id: string) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const rects = ids.map((id) => [id, box(id)] as const).filter(([, r]) => r) as [string, DOMRect][];
    for (const [id, r] of rects) if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`${id} outside ${vw}x${vh}`);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (hit(rects[i][1], rects[j][1])) out.push(`${rects[i][0]} x ${rects[j][0]}`);
    if (withPanel) {
      const p = box('gps-panel');
      if (!p) out.push('gps-panel hidden');
      else {
        if (p.left < 0 || p.top < 0 || p.right > vw || p.bottom > vh) out.push('gps-panel outside');
        // The open list may cover the place name and the next-turn hint, never the controls, gauges or map.
        for (const [id, r] of rects) if (!['location', 'nav-hint', 'toast', 'chunk-loading'].includes(id) && hit(p, r)) out.push(`gps-panel x ${id}`);
      }
    }
    return out;
  }, { ids: DRIVE_HUD, withPanel });
}

test.describe('touch driving', () => {
  test('pedals, steering, multitouch, release, GPS and layout without a keyboard', async ({ page }, info) => {
    test.setTimeout(300_000);
    mkdirSync(SHOTS, { recursive: true });
    const issues = watch(page);
    await start(page);
    await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
    await page.evaluate(() => (window as any).__k3d.setSimulatedDt(1 / 60));
    const cdp = await page.context().newCDPSession(page);
    const tapAt = async (sel: string, id = 30) => {
      const c = await centre(page, sel);
      await send(cdp, 'touchStart', [{ ...c, id }]);
      await send(cdp, 'touchEnd', []);
      await frames(page, 2);
    };

    // 1. On foot beside the car: the Enter Car prompt sits clear of the joystick; tapping it gets in.
    await page.evaluate(() => {
      const k = (window as any).__k3d, c = k.driving.car;
      k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9);
      k.tpc.snap();
    });
    await expect(page.locator('#car-prompt')).toBeVisible();
    const prompt = (await page.locator('#car-prompt').boundingBox())!, joy = (await page.locator('#joystick').boundingBox())!;
    expect(prompt.y + prompt.height <= joy.y || prompt.x >= joy.x + joy.width).toBe(true);
    await tapAt('#car-prompt');
    await expect.poll(() => carState(page).then((c) => c.active)).toBe(true);
    await expect(page.locator('#steer-pad')).toBeVisible();
    await expect(page.locator('#joystick')).toBeHidden();
    await expect(page.locator('#gps-btn')).toBeVisible();
    const startState = await carState(page);

    // 2. Multitouch: steer right and accelerate at once (two fingers), through the same Input fields as the keys.
    const gas = await centre(page, '#btn-gas'), brake = await centre(page, '#btn-brake'), hb = await centre(page, '#btn-hb');
    const steerR = await centre(page, '#steer-pad', 0.92), steerL = await centre(page, '#steer-pad', 0.08);
    // Touch latency: from the touch event to the first simulation frame that reads it (page clock).
    await page.evaluate(() => {
      const w = window as any;
      w.__lat = null;
      document.addEventListener('touchstart', () => {
        const t0 = performance.now();
        const poll = () => (w.__k3d.input.moveY !== 0 ? (w.__lat = performance.now() - t0) : requestAnimationFrame(poll));
        requestAnimationFrame(poll);
      }, { once: true, capture: true });
    });
    await send(cdp, 'touchStart', [{ ...gas, id: 1 }]);
    await send(cdp, 'touchStart', [{ ...gas, id: 1 }, { ...steerR, id: 2 }]);
    await frames(page, 3);
    const both = await touchIn(page);
    expect(both.x).toBeGreaterThan(0.9);
    expect(both.y).toBe(1);
    expect(both.moveX).toBeGreaterThan(0.5);
    expect(both.moveY).toBeGreaterThan(0.5);
    const latency = await page.evaluate(() => (window as any).__lat);
    // Steering only briefly (the V7 lane is narrow), then straight on with gas.
    await frames(page, 8);
    const steered = await carState(page);
    expect(steered.steer).toBeLessThan(0); // wheel angle: positive = left (VehiclePhysics)
    await send(cdp, 'touchMove', [{ ...gas, id: 1 }, { ...steerL, id: 2 }]);
    await frames(page, 4);
    expect((await touchIn(page)).x).toBeLessThan(-0.9);
    await liftOne(page, { id: 2, sel: '#steer-pad' }, [{ id: 1, sel: '#btn-gas' }]); // the steering finger lifts, gas stays down
    await frames(page, 2);
    expect(await touchIn(page)).toMatchObject({ x: 0, y: 1 });
    await frames(page, 90);
    const moving = await carState(page);
    expect(moving.kmh).toBeGreaterThan(8);
    expect(Math.hypot(moving.x - startState.x, moving.z - startState.z)).toBeGreaterThan(3);
    expect(moving.inBuilding).toBe(false);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-driving.png`, scale: 'css' });

    // 3. Brake: gas + brake together never drives forward; brake alone stops the car, then reverses (gear R).
    await send(cdp, 'touchStart', [{ ...gas, id: 1 }, { ...brake, id: 3 }]);
    await frames(page, 2);
    expect((await touchIn(page)).y).toBe(-1);
    await liftOne(page, { id: 1, sel: '#btn-gas' }, [{ id: 3, sel: '#btn-brake' }]); // the gas finger lifts
    await frames(page, 2);
    expect((await touchIn(page)).y).toBe(-1);
    await expect.poll(async () => (await carState(page)).vf, { timeout: 20_000 }).toBeLessThan(-0.4);
    await expect(page.locator('#speedo-gear')).toHaveText('R');
    await send(cdp, 'touchEnd', []);
    await frames(page, 2);
    expect(await touchIn(page)).toMatchObject(idle);

    // 4. Handbrake is held only while the finger is down.
    await send(cdp, 'touchStart', [{ ...hb, id: 4 }]);
    await frames(page, 2);
    expect((await touchIn(page)).handbrake).toBe(true);
    await send(cdp, 'touchEnd', []);
    await frames(page, 2);
    expect((await touchIn(page)).handbrake).toBe(false);
    await expect.poll(async () => Math.abs((await carState(page)).vf), { timeout: 20_000 }).toBeLessThan(0.3);

    // 5. Nothing stays held after an interruption: touch cancel, lost focus, orientation change, a menu, a finger that
    //    slides off its button, and a lift the page never hears about (pruned on the next touch).
    const holdGas = async () => {
      await send(cdp, 'touchStart', [{ ...gas, id: 5 }, { ...steerR, id: 6 }, { ...hb, id: 7 }]);
      await frames(page, 2);
      expect(await touchIn(page)).toMatchObject({ y: 1, hb: true });
    };
    await holdGas();
    await send(cdp, 'touchCancel', []);
    await frames(page, 2);
    expect(await touchIn(page), 'touchcancel').toMatchObject(idle);
    for (const [name, ev] of [['blur', 'window.dispatchEvent(new Event("blur"))'], ['orientation', 'window.dispatchEvent(new Event("orientationchange"))'], ['pagehide', 'window.dispatchEvent(new Event("pagehide"))']]) {
      await holdGas();
      await page.evaluate(ev);
      await frames(page, 2);
      expect(await touchIn(page), name).toMatchObject(idle);
      await send(cdp, 'touchEnd', []);
    }
    await holdGas();
    await page.evaluate(() => (window as any).__k3d.menu.pause());
    await frames(page, 3);
    expect(await touchIn(page), 'pause menu').toMatchObject(idle);
    await send(cdp, 'touchEnd', []);
    await page.locator('#pause-resume').click();
    await frames(page, 3);
    await holdGas();
    await send(cdp, 'touchMove', [{ x: gas.x - 150, y: gas.y - 220, id: 5 }, { ...steerR, id: 6 }, { ...hb, id: 7 }]);
    await send(cdp, 'touchEnd', []);
    await frames(page, 2);
    expect(await touchIn(page), 'slid off').toMatchObject(idle);
    // A lift the page never hears about: the next touch anywhere drops the stale finger.
    await holdGas();
    await page.evaluate(() => (window as any).__k3d.mobile.held.set(99, 'gas'));
    const view = page.viewportSize()!;
    await send(cdp, 'touchStart', [{ x: view.width / 2, y: view.height * 0.4, id: 8 }]);
    await send(cdp, 'touchEnd', []);
    await frames(page, 2);
    expect(await touchIn(page), 'stale finger').toMatchObject(idle);
    await expect.poll(async () => Math.abs((await carState(page)).vf), { timeout: 20_000 }).toBeLessThan(0.3);

    // 6. Camera: CAM steps the chase distance, a drag on the 3D view turns the camera, RESET runs the safe reset.
    const d0 = await page.evaluate(() => (window as any).__k3d.driving.camera.distance);
    await tapAt('#btn-cam');
    expect(await page.evaluate(() => (window as any).__k3d.driving.camera.distance)).not.toBe(d0);
    const yaw0 = await page.evaluate(() => (window as any).__k3d.driving.camera.yaw);
    await send(cdp, 'touchStart', [{ x: view.width / 2, y: view.height * 0.35, id: 9 }]);
    for (let i = 1; i <= 8; i++) await send(cdp, 'touchMove', [{ x: view.width / 2 - i * 14, y: view.height * 0.35, id: 9 }]);
    await send(cdp, 'touchEnd', []);
    expect(Math.abs((await page.evaluate(() => (window as any).__k3d.driving.camera.yaw)) - yaw0)).toBeGreaterThan(0.2);
    await tapAt('#btn-reset');
    expect(await page.evaluate(() => (window as any).__k3d.driving.lastReset)).not.toBeNull();
    await frames(page, 30);

    // 7. GPS by touch only: open while a finger holds the brake (multitouch), pick Lau Ya Keng, drive, see the
    //    remaining distance fall, cancel. Panel taps never reach the pedals.
    await send(cdp, 'touchStart', [{ ...brake, id: 10 }]);
    const gpsBtn = await centre(page, '#gps-btn');
    await send(cdp, 'touchStart', [{ ...brake, id: 10 }, { ...gpsBtn, id: 11 }]);
    await liftOne(page, { id: 11, sel: '#gps-btn' }, [{ id: 10, sel: '#btn-brake' }]); // the GPS finger lifts
    await expect(page.locator('#gps-panel')).toBeVisible();
    expect((await touchIn(page)).y).toBe(-1);
    await send(cdp, 'touchEnd', []);
    await expect(page.locator('#gps-panel .gps-item').first()).not.toHaveText(/Checking roads/, { timeout: 20_000 });
    expect(await layoutIssues(page, true)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-gps-panel.png`, scale: 'css' });
    const item = await centre(page, '#gps-panel .gps-item[data-id="lau-ya-keng-food-court"]');
    await send(cdp, 'touchStart', [{ ...item, id: 12 }]);
    await send(cdp, 'touchEnd', []);
    await expect(page.locator('#gps-panel')).toBeHidden({ timeout: 10_000 });
    expect(await touchIn(page)).toMatchObject(idle);
    await expect(page.locator('#nav-hint')).toBeVisible();
    const navText = () => page.evaluate(() => (document.querySelector('#nav-hint .nav-main')!.textContent ?? '') + ' | ' + (document.querySelector('#nav-hint .nav-sub')!.textContent ?? ''));
    const before = await navText();
    expect(await page.evaluate(() => (window as any).__k3d.minimap.nav?.mode)).toBe('drive');
    // Gas straight on along the lane; the hint's remaining distance falls.
    const dist0 = await page.evaluate(() => (window as any).__k3d.minimap.nav?.remaining ?? null);
    await send(cdp, 'touchStart', [{ ...gas, id: 13 }]);
    await frames(page, 90);
    await send(cdp, 'touchEnd', []);
    // Stop with the handbrake (the brake pedal would go on into reverse once stopped).
    await send(cdp, 'touchStart', [{ ...hb, id: 14 }]);
    await expect.poll(async () => Math.abs((await carState(page)).vf), { timeout: 20_000 }).toBeLessThan(0.3);
    await send(cdp, 'touchEnd', []);
    await frames(page, 20);
    const after = await navText();
    const m0 = metres(before.split(' | ').reverse().join(' ')), m1 = metres(after.split(' | ').reverse().join(' '));
    console.log(`[touch-drive ${info.project.name}] latency ${latency?.toFixed(1)} ms; hint before "${before}" after "${after}"; nav.remaining ${dist0}`);
    expect(after).not.toBe(before);
    if (m0 !== null && m1 !== null) expect(m1).toBeLessThan(m0);
    expect((await carState(page)).inBuilding).toBe(false);
    expect(await layoutIssues(page, false)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-route.png`, scale: 'css' });

    // 8. Layout sweep at phone / tablet sizes, portrait and landscape, with a route active and with the GPS list open.
    const orig = page.viewportSize()!;
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 4);
      expect(await layoutIssues(page, false), `${w}x${h}`).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/drive-${w}x${h}.png`, scale: 'css' });
      await tapAt('#gps-btn');
      await expect(page.locator('#gps-panel')).toBeVisible();
      await expect(page.locator('#gps-panel .gps-item').first()).not.toHaveText(/Checking roads/, { timeout: 20_000 });
      expect(await layoutIssues(page, true), `${w}x${h} + GPS list`).toEqual([]);
      if (w === 390 || w === 844) await page.screenshot({ path: `${SHOTS}/gps-${w}x${h}.png`, scale: 'css' });
      await tapAt('#gps-panel .gps-close');
      await expect(page.locator('#gps-panel')).toBeHidden();
    }
    await page.setViewportSize(orig);
    await frames(page, 4);

    // 9. Cancel navigation with the hint's ✕, then get out with EXIT: the walking controls come back.
    await tapAt('#nav-hint .nav-clear');
    expect(await page.evaluate(() => (window as any).__k3d.minimap.nav)).toBeNull();
    await tapAt('#btn-exit');
    await expect.poll(() => carState(page).then((c) => c.active)).toBe(false);
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#steer-pad')).toBeHidden();
    expect(await touchIn(page)).toMatchObject(idle);
    expect(await page.evaluate(() => window.scrollY + window.scrollX)).toBe(0);
    expect(issues.errors).toEqual([]);
  });
});
