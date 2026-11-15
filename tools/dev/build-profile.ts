// Prints where chunk mesh build time goes (per stage) after loading the area around the spawn.
// Usage: node tools/dev/build-profile.ts [--url=http://localhost:3000/] [--quality=high]
import { chromium } from '@playwright/test';
const opt = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, opt('quality', 'high'));
await page.goto(opt('url', 'http://localhost:3000/'));
await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120000 });
await page.click('#btn-start');
await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 120000 });
const r = await page.evaluate(() => { const c = (window as any).__k3d.world.chunks; return { built: c.stats.built, maxBuildMs: +c.stats.maxBuildMs.toFixed(1), profile: Object.fromEntries(Object.entries(c.buildProfile).map(([k, v]) => [k, +(v as number).toFixed(0)])) }; });
console.log(JSON.stringify(r));
await browser.close();
