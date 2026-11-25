// N1-M3b: where does the time to `__k3d.ready` go? For each build: one cold start with a CPU profile (CDP), the
// start-up milestones (page script, world loaded, spawn chunk built, ready), the chunk build stages, resources and
// long tasks. Use an un-minified build (`npx vite build --minify false`) to get readable function names.
// Usage: node tools/dev/load-profile.ts <dist> [<dist> ...] [--top=40] [--mobile] [--cpu=4]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const dists = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const top = +(process.argv.find((a) => a.startsWith('--top='))?.slice(6) ?? 40);
const mobile = process.argv.includes('--mobile');
const cpu = +(process.argv.find((a) => a.startsWith('--cpu='))?.slice(6) ?? 1);
for (const [i, dist] of dists.entries()) {
  const port = 4195 + i;
  const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { shell: true, stdio: 'pipe' });
  await new Promise<void>((res) => server.stdout.on('data', (b) => String(b).includes(String(port)) && res()));
  const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { if (!localStorage.getItem('k3d.character')) localStorage.setItem('k3d.character', 'man'); } catch { /* ignore */ }
      const w = window as any;
      w.__lp = { marks: {} as Record<string, number>, long: [] as number[][], texts: [] as [number, string][] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lp.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch { /* ignore */ }
      const iv = setInterval(() => {
        const k = w.__k3d, m = w.__lp.marks, now = Math.round(performance.now());
        const text = document.querySelector('#loading-text, .loading-text, #load-text')?.textContent ?? '';
        if (text && w.__lp.texts.at(-1)?.[1] !== text) w.__lp.texts.push([now, text]);
        if (k && !m.hook) m.hook = now;
        if (k && !m.spawn && k.world.chunks.isReady(k.player.position.x, k.player.position.z) && k.world.chunks.progress() > 0.6) m.spawn = now;
        if (k?.ready && !m.ready) { m.ready = now; clearInterval(iv); }
      }, 10);
    });
    const cdp = await ctx.newCDPSession(page);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 180_000 });
    const loadMs = Date.now() - t0;
    const { profile } = await cdp.send('Profiler.stop');
    const info = await page.evaluate(() => {
      const k = (window as any).__k3d, lp = (window as any).__lp;
      const res = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .map((r) => ({ n: r.name.replace(location.origin, ''), s: Math.round(r.startTime), d: Math.round(r.duration), kb: Math.round(r.encodedBodySize / 1024) }));
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        marks: lp.marks, texts: lp.texts, long: lp.long, res, dcl: Math.round(nav.domContentLoadedEventEnd),
        buildProfile: k.world.chunks.buildProfile, stats: k.world.chunks.stats, programs: k.renderer.info.programs.length,
        mem: k.renderer.info.memory,
      };
    });
    // Self time per function, and per "stack contains function" (inclusive) for the hot paths.
    const nodes = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map<string, number>(), incl = new Map<string, number>();
    const name = (n: any) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    for (let s = 0; s < profile.samples!.length; s++) {
      const dt = (profile.timeDeltas![s] ?? 0) / 1000;
      let n = nodes.get(profile.samples![s]);
      self.set(name(n), (self.get(name(n)) ?? 0) + dt);
      const seen = new Set<string>();
      for (; n; n = nodes.get(parent.get(n.id)!)) { const k = name(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } }
    }
    // The same, per slice of the start-up (profile time; the profile starts just before navigation).
    const binMs = +(process.argv.find((a) => a.startsWith('--bin='))?.slice(6) ?? 500);
    const bins: Map<string, number>[] = [];
    let clock = 0;
    for (let s = 0; s < profile.samples!.length; s++) {
      const dt = (profile.timeDeltas![s] ?? 0) / 1000;
      clock += dt;
      const b = (bins[Math.floor(clock / binMs)] ??= new Map());
      const seen = new Set<string>();
      for (let n = nodes.get(profile.samples![s]); n; n = nodes.get(parent.get(n.id)!)) { const k = name(n).split(' ')[0]; if (!seen.has(k)) { seen.add(k); b.set(k, (b.get(k) ?? 0) + dt); } }
    }
    const dull = new Set(['(root)', '(anon)', 'frame', 'renderScene', 'renderObjects', 'renderObject', 'WebGLRenderer.renderBufferDirect', 'setProgram', 'onFirstUse', 'WebGLProgram.getUniforms', 'update', 'pump', 'next']);
    console.log(`--- timeline, ${binMs} ms slices (inclusive ms)`);
    bins.forEach((b, i) => console.log(`${String(i * binMs).padStart(6)}  ${[...b].filter(([k]) => !dull.has(k)).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`));
    const rank = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`);
    const r = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
    console.log(`\n===== ${dist}  load ${loadMs} ms  cpu x${cpu}${mobile ? ' mobile' : ''}`);
    console.log('marks (ms from navigation):', JSON.stringify({ dcl: info.dcl, ...info.marks }));
    console.log('loading text:', JSON.stringify(info.texts));
    console.log('chunk build stages (ms):', JSON.stringify(r(info.buildProfile)), JSON.stringify(info.stats, (_, v) => (typeof v === 'number' ? Math.round(v) : v)));
    console.log('programs', info.programs, 'gpu', JSON.stringify(info.mem));
    console.log('long tasks [start, ms] (over 80 ms):', JSON.stringify(info.long.filter((l: number[]) => l[1] > 80)));
    const slow = info.res.filter((x: any) => x.d > 150 || x.kb > 200).sort((a: any, b: any) => b.s + b.d - a.s - a.d);
    console.log(`resources: ${info.res.length}, last finished ${Math.max(...info.res.map((x: any) => x.s + x.d))} ms; slow or large:`);
    for (const x of slow.slice(0, 25)) console.log(`   ${String(x.s).padStart(5)} +${String(x.d).padStart(5)} ms ${String(x.kb).padStart(6)} kB  ${x.n}`);
    console.log('--- self time'); console.log(rank(self).join('\n'));
    console.log('--- inclusive time'); console.log(rank(incl).join('\n'));
  } finally {
    await browser.close();
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    await new Promise((res) => setTimeout(res, 1500));
  }
}
