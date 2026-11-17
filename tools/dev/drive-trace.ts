// Developer aid: drive a short route with the test driver and print its trace.
import { chromium } from '@playwright/test';
import { driveRoute } from '../../tests/e2e/driving-helpers.ts';
const url = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000/';
const pts = JSON.parse(process.argv[2]) as [number, number][];
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 90000 });
await page.click('#btn-start');
await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60000 });
await page.evaluate(() => { const k = (window as any).__k3d, c = k.driving.car; k.player.teleport(c.x - Math.cos(c.heading) * 2, c.z + Math.sin(c.heading) * 2); });
await page.waitForTimeout(2500);
await page.keyboard.press('KeyE');
const r = await driveRoute(page, pts, { speed: 9, speedup: 2, maxSeconds: 120, trace: true });
for (const t of r.trace) console.log(t.join('\t'));
console.log(JSON.stringify({ ...r, trace: undefined }));
await browser.close();
