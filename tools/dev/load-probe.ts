// V8.1: start-up cost of the V7 street section's shader programs. For each build: time from navigation to
// __k3d.ready, then Start and a 360-degree look round at the spawn (where the section is), recording the frames.
// A program compiled before `ready` lengthens loading; one compiled after it is a freeze during play.
// Usage: node tools/dev/load-probe.ts <distA> [<distB> ...] [--repeat=3]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const dists = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const repeat = +(process.argv.find((a) => a.startsWith('--repeat='))?.slice(9) ?? 3);
for (let r = 0; r < repeat; r++) for (const [i, dist] of dists.entries()) {
  const port = 4190 + i;
  const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { shell: true, stdio: 'pipe' });
  await new Promise<void>((res) => server.stdout.on('data', (b) => String(b).includes(String(port)) && res()));
  const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => { try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ } }); // N1-M1: skip the first-launch character picker
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120_000 });
    const loadMs = Date.now() - t0;
    const progsReady = await page.evaluate(() => (window as any).__k3d.renderer.info.programs.length);
    await page.click('#btn-start');
    const pan = await page.evaluate(() => new Promise<any>((resolve) => {
      const k = (window as any).__k3d, dts: number[] = [];
      let last = performance.now();
      const t0 = last, y0 = k.tpc.yaw;
      const tick = () => {
        const now = performance.now();
        dts.push(now - last); last = now;
        k.tpc.yaw = y0 + ((now - t0) / 8000) * Math.PI * 2;
        if (now - t0 < 8000) return requestAnimationFrame(tick);
        const slow = dts.filter((d) => d > 50);
        resolve({ worst: Math.round(Math.max(...dts)), over50: slow.length, over200: dts.filter((d) => d > 200).length, slowMs: Math.round(slow.reduce((a, b) => a + b, 0)), progs: k.renderer.info.programs.length });
      };
      requestAnimationFrame(tick);
    }));
    console.log(JSON.stringify({ dist: dist.split(/[\\/]/).pop(), run: r + 1, loadMs, progsReady, pan }));
  } finally {
    await browser.close();
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    await new Promise((res) => setTimeout(res, 1500));
  }
}
