// V8.4: mobile layout check of the GPS UI (390x844 touch) against a running server. Usage: node tools/dev/gps-mobile-check.ts <base url> <out dir>
import { chromium } from '@playwright/test';
const BASE = process.argv[2], OUT = process.argv[3];
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120_000 });
await page.locator('#btn-start').tap();
await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
await page.evaluate(() => {
  const k = (window as any).__k3d, c = k.driving.car;
  k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9);
});
await page.waitForTimeout(300);
await page.locator('#car-prompt').tap().catch(() => page.evaluate(() => (window as any).__k3d.driving.enter((window as any).__k3d.player)));
await page.waitForTimeout(500);
await page.locator('#gps-btn').tap();
await page.waitForFunction(() => !document.querySelector('#gps-panel .gps-item')?.textContent?.includes('Checking'), null, { timeout: 30_000 });
await page.screenshot({ path: `${OUT}/gps-mobile-panel.png` });
const rects = await page.evaluate(() => {
  const r = (id: string) => { const b = document.querySelector(id)!.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
  return { panel: r('#gps-panel'), btn: r('#gps-btn'), speedo: r('#speedo'), joystick: r('#joystick'), vw: innerWidth, vh: innerHeight };
});
await page.locator('#gps-panel .gps-item[data-id="waterfront"]').tap();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/gps-mobile-route.png` });
const hint = await page.evaluate(() => { const b = document.getElementById('nav-hint')!.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom), document.querySelector('#nav-hint .nav-main')!.textContent]; });
console.log(JSON.stringify({ rects, hint, errors }));
await browser.close();
