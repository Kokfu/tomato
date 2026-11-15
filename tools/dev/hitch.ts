// Dev utility: list the worst frames during a 360-degree pan at the spawn point.
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:3000/';
const q = process.argv[3] ?? 'medium';
const browser = await chromium.launch({ channel: 'msedge', args: process.argv[4] === 'vsync' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto(url);
await page.waitForFunction(() => (window as any).__k3d?.ready);
await page.click('#btn-start');
await page.evaluate((q) => (document.querySelector(`#quality-seg [data-q="${q}"]`) as HTMLElement).click(), q);
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999);
await page.waitForTimeout(1000);
for (const pass of [1, 2]) {
  const res = await page.evaluate(() => new Promise<any>((resolve) => {
    const k = (window as any).__k3d;
    const t: [number, number][] = [];
    let last = performance.now();
    const t0 = last, y0 = k.tpc.yaw;
    const tick = () => {
      const now = performance.now();
      t.push([Math.round(now - t0), +(now - last).toFixed(1)]);
      last = now;
      k.tpc.yaw = y0 + ((now - t0) / 6000) * Math.PI * 2;
      if (now - t0 < 6000) return requestAnimationFrame(tick);
      const sorted = t.slice().sort((a, b) => b[1] - a[1]);
      resolve({ frames: t.length, worst: sorted.slice(0, 8), over33: t.filter((f) => f[1] > 33.4).length, over17: t.filter((f) => f[1] > 16.7).length });
    };
    requestAnimationFrame(tick);
  }));
  console.log(`pass ${pass}:`, JSON.stringify(res));
}
await browser.close();
