// V8.6: cold start-up and graphics-preset switches on the emulated phone (390x844, DPR 3, touch, CPU throttled 4x),
// starting in Low. For each build: navigation to __k3d.ready (time to playable), programs at ready, an 8 s 360-degree
// look round at the spawn, then Low -> Medium -> High -> Low through the settings buttons, each followed by an 8 s
// look round. Per phase: frame-time statistics, programs compiled, and "held" = time the previous frame stayed on
// screen because a preset change's programs were still compiling (V8.6 holds drawing; older builds draw at once).
// Emulated, not a real phone. Alternate builds and repeat: runs vary.
// Usage: node tools/dev/preset-probe.ts <distA> [<distB> ...] [--repeat=2] [--out=file.json]
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const dists = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const repeat = +(process.argv.find((a) => a.startsWith('--repeat='))?.slice(9) ?? 2);
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'test-results/preset-probe.json';
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
const results: any[] = [];

const killPort = (port: number) => {
  if (process.platform !== 'win32') return;
  const pids = new Set(execSync('netstat -ano').toString().split(/\r?\n/).filter((l) => l.includes(`:${port} `) && l.includes('LISTEN')).map((l) => l.trim().split(/\s+/).pop()));
  for (const pid of pids) try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
};

for (let r = 0; r < repeat; r++) for (const [i, dist] of dists.entries()) {
  const port = 4195 + i;
  killPort(port);
  spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let t = 0; t < 100; t++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* not yet */ } await new Promise((res) => setTimeout(res, 200)); }
  const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await ctx.addInitScript(() => { try { localStorage.setItem('k3d.quality', 'low'); } catch { /* ignore */ } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 180_000 });
    const loadMs = Date.now() - t0;
    const transfer = await page.evaluate(() => Math.round((performance.getEntriesByType('resource') as PerformanceResourceTiming[]).concat(performance.getEntriesByType('navigation') as any).reduce((s, e) => s + (e.transferSize || 0), 0) / 1024));
    const progsReady = await page.evaluate(() => (window as any).__k3d.renderer.info.programs.length);
    await page.click('#btn-start');
    await page.evaluate(() => { const el = document.getElementById('opt-adaptive') as HTMLInputElement | null; if (el?.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
    const phase = (label: string, q: string | null) => page.evaluate(([label, q]) => new Promise<any>((resolve) => {
      const k = (window as any).__k3d, dts: number[] = [], p0 = k.renderer.info.programs.length;
      let last = performance.now(), held = 0, heldUntil = 0;
      const t0 = last, y0 = k.tpc.yaw;
      if (q) (document.querySelector(`#quality-seg button[data-q="${q}"]`) as HTMLButtonElement).click();
      const tick = () => {
        const now = performance.now();
        dts.push(now - last); last = now;
        // A held frame draws nothing (renderer.info is reset every frame).
        if (k.renderer.info.render.calls === 0 && dts.length > 1) { held += dts[dts.length - 1]; heldUntil = now - t0; }
        k.tpc.yaw = y0 + ((now - t0) / 8000) * Math.PI * 2;
        if (now - t0 < 8000) requestAnimationFrame(tick);
        else {
          const s = dts.slice(1).sort((a, b) => a - b), m = k.renderer.info.memory;
          resolve({ label, frames: s.length, avgFps: +((s.length / (now - t0)) * 1000).toFixed(1), medianMs: +pct(s, 50).toFixed(1), p95Ms: +pct(s, 95).toFixed(1), p99Ms: +pct(s, 99).toFixed(1), worstMs: +s[s.length - 1].toFixed(1),
            over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length, over200: s.filter((x) => x > 200).length,
            newPrograms: k.renderer.info.programs.length - p0, heldMs: Math.round(held), heldUntilMs: Math.round(heldUntil),
            geometries: m.geometries, textures: m.textures, shadows: k.renderer.shadowMap.enabled, targetMB: k.v5?.pipeline ? +(k.v5.pipeline.targetBytes() / 1048576).toFixed(1) : 0 });
        }
      };
      function pct(s: number[], p: number) { return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
      requestAnimationFrame(tick);
    }), [label, q] as const);
    await page.waitForTimeout(1000);
    const phases = [await phase('low look-round', null)];
    for (const q of ['medium', 'high', 'low']) { phases.push(await phase(`-> ${q}`, q)); await page.waitForTimeout(500); }
    const row = { dist, run: r + 1, loadMs, transferKB: transfer, progsReady, phases };
    results.push(row);
    console.log(`\n${dist} run ${r + 1}: ready ${loadMs} ms, ${transfer} KB transferred, ${progsReady} programs at ready`);
    for (const p of phases) console.log('  ', JSON.stringify(p));
  } finally {
    await browser.close();
    killPort(port);
  }
}
writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('written', OUT);
process.exit(0);
