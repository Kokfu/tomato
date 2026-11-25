// N1-M6 part A: the day/night cycle and the rain. Night and rain are shader uniforms and light values only: switching
// to them must not compile a single new program (that would be a stall on a phone), and must be exactly reversible.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watch, start, frames, waitChunks, seedCharacter } from './helpers.ts';

const k3d = <T>(page: Page, fn: (k: any) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__k3d)`) as Promise<T>;
const lights = (page: Page) => k3d(page, (k) => ({
  sun: k.world.sun.intensity, hemi: k.world.hemi.intensity, exposure: k.renderer.toneMappingExposure, fog: k.world.scene.fog.density,
  env: k.world.scene.environmentIntensity, pools: k.world.materials.pools.visible, lamp: k.world.materials.lampGlow.color.r,
  rain: k.world.scene.children.some((o: any) => o.material?.uniforms?.uAmount && o.visible), programs: k.renderer.info.programs.length,
  hour: k.world.hour, time: k.world.timeMode, rainMode: k.world.rainMode, wet: k.world.weather.wet,
}));
const lookRound = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  const k = (window as any).__k3d, y0 = k.tpc.yaw;
  let i = 0;
  const tick = () => { k.tpc.yaw = y0 + (i / 60) * Math.PI * 2; if (++i > 60) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));

test.describe('N1-M6 day/night and rain', () => {
  test('night and rain switch on with no new shader program, and day comes back exactly', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    await waitChunks(page);
    await frames(page, 30);
    const day = await lights(page);
    // an automated browser starts on a frozen dry day (dayCycle.ts startModes)
    expect(day.time).toBe('day');
    expect(day.rainMode).toBe('off');
    expect(day.hour).toBeCloseTo(9 + 40 / 60, 6);
    expect(day.pools).toBe(false);
    expect(day.rain).toBe(false);
    expect(day.wet).toBe(0);

    await k3d(page, (k) => k.setTime('night'));
    await frames(page, 5);
    await lookRound(page);
    const night = await lights(page);
    expect(night.hour).toBe(21);
    expect(night.sun).toBeLessThan(day.sun * 0.15);
    expect(night.hemi).toBeLessThan(day.hemi * 0.5);
    expect(night.exposure).toBeGreaterThan(day.exposure * 1.3);
    expect(night.env).toBeLessThan(day.env * 0.3);
    expect(night.pools).toBe(true);
    expect(night.lamp).toBeGreaterThan(1);
    expect(night.programs).toBe(day.programs);

    await k3d(page, (k) => k.setRain('on', 1));
    await frames(page, 5);
    await lookRound(page);
    const storm = await lights(page);
    expect(storm.rain).toBe(true);
    expect(storm.wet).toBe(1);
    expect(storm.fog).toBeGreaterThan(night.fog * 2.5);
    expect(storm.programs).toBe(day.programs);

    // rain by day, then everything off again
    await k3d(page, (k) => k.setTime('day'));
    await frames(page, 5);
    const rainyDay = await lights(page);
    expect(rainyDay.sun).toBeLessThan(day.sun * 0.3);
    expect(rainyDay.pools).toBe(true); // lamps come on under a storm sky
    await k3d(page, (k) => k.setRain('off', 0));
    await frames(page, 5);
    const again = await lights(page);
    expect(again).toEqual(day);
    expect(issues.errors).toEqual([]);
  });

  test('settings: the day passes, stops at a chosen time and is remembered; the address can set it', async ({ page }) => {
    const issues = watch(page);
    await start(page);
    const click = (sel: string) => page.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), sel);
    await click('#btn-settings');
    await click('#time-seg [data-t="auto"]');
    await click('#rain-seg [data-r="on"]');
    expect(await page.evaluate(() => [localStorage.getItem('k3d.time'), localStorage.getItem('k3d.rain')])).toEqual(['auto', 'on']);
    // nothing moves while the settings panel (a pause) is open
    await k3d(page, (k) => k.setSimulatedDt(0.5));
    await frames(page, 20);
    expect((await lights(page)).hour).toBeCloseTo(9 + 40 / 60, 6);
    expect((await lights(page)).wet).toBe(0);
    await click('#settings-close');
    await frames(page, 120); // a minute of play: 1 h 20 min of daylight, and the shower has soaked the road
    const later = await lights(page);
    expect(later.time).toBe('auto');
    expect(later.hour).toBeGreaterThan(10.5);
    expect(later.hour).toBeLessThan(12);
    expect(later.wet).toBe(1);
    expect(later.rain).toBe(true);
    await click('#btn-settings');
    await click('#time-seg [data-t="night"]');
    await click('#settings-close');
    await frames(page, 20);
    expect((await lights(page)).hour).toBe(21);
    await k3d(page, (k) => k.setSimulatedDt(0));

    // the saved choice is used on the next visit: night, raining at once
    await page.reload();
    await page.waitForFunction(() => (window as any).__k3d?.ready === true, null, { timeout: 90_000 });
    const back = await lights(page);
    expect([back.time, back.hour, back.rainMode, back.wet]).toEqual(['night', 21, 'on', 1]);
    expect(await page.evaluate(() => document.querySelector('#time-seg .active')?.getAttribute('data-t'))).toBe('night');
    expect(await page.evaluate(() => document.querySelector('#rain-seg .active')?.getAttribute('data-r'))).toBe('on');

    // the address wins over the saved choice
    await seedCharacter(page);
    await page.goto('./?time=18.2&rain=off');
    await page.waitForFunction(() => (window as any).__k3d?.ready === true, null, { timeout: 90_000 });
    const url = await lights(page);
    expect(url.hour).toBeCloseTo(18.2, 6);
    expect(url.rainMode).toBe('off');
    expect(url.wet).toBe(0);
    expect(url.pools).toBe(true);
    expect(issues.errors).toEqual([]);
  });
});
