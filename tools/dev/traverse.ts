// Scripted 60-second traversal benchmark: Waterfront promenade -> Jalan Main Bazaar -> Lebuh Wayang
// -> Jalan Ewe Hai / Carpenter Street, running the whole way so streaming, culling and shadows are
// exercised. Usage:
//   node tools/dev/traverse.ts <label> [--url=http://localhost:4173/] [--out=docs/perf-v2.json] [--seconds=60]
// Run it against a production build (`npm run build && npm run preview`). Results are merged into
// the output file under <label>, so "before" and "after" builds can be compared side by side.
// Without --vsync the frame rate is uncapped (throughput / headroom); with --vsync it is capped
// (real frame pacing).
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = opt('url', 'http://localhost:4173/');
const out = opt('out', 'docs/perf-v2.json');
const seconds = Number(opt('seconds', '60'));
// --vsync: keep the display's refresh cap. Use it for frame pacing (1 % low, slow-frame counts);
// the uncapped mode shows throughput but stalls periodically on some integrated GPUs.
const vsync = args.includes('--vsync');

/** Route in world metres (x east, z south), following mapped road centrelines. */
const ROUTE: [number, number][] = [
  [118, -143], [186, -100], [256, -47], [325, 0], [420, 62], [400, 100], [383, 128],
  [330, 88], [264, 57], [190, 28], [120, 0], [65, -35],
];

interface Result {
  session: string; quality: string; viewport: { width: number; height: number }; deviceScaleFactor: number; pixelRatio: number;
  seconds: number; frames: number; distanceM: number; stuckRescues: number;
  fpsAvg: number; fpsP1Low: number; frameMsAvg: number; frameMsP95: number; frameMsP99: number; frameMsMax: number; framesOver33ms: number; framesOver50ms: number;
  cpuFrameMsAvg: number; cpuFrameMsP99: number; gpuFrameMsAvg: number | null; gpuFrameMsP99: number | null; gpuTimer: string;
  drawCallsAvg: number; drawCallsMax: number; trianglesAvg: number; trianglesMax: number;
  heapPeakMB: number | null; geometriesMax: number; texturesMax: number;
  initial: { timeToPlayableMs: number; requests: number; bytesUncompressed: number; bytesTransferred: number; chunkRequests: number };
  streaming: { chunksFetched: number; chunksBuilt: number; chunkBuildMsMax: number; chunkFetchMsAvg: number; chunkFetchMsMax: number; framesWaitingOnChunk: number; totalBytesUncompressed: number; totalBytesTransferred: number };
  consoleErrors: string[];
}

async function run(browser: Browser, session: string, ctxOpts: any, quality: string): Promise<Result> {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  let bytes = 0, requests = 0, chunkReqs = 0, transferred = 0;
  const fetchMs: number[] = [];
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e: any) => { transferred += e.encodedDataLength; });
  page.on('response', async (r) => {
    try {
      const b = (await r.body()).length;
      bytes += b; requests++;
      if (r.url().includes('/chunks/')) {
        chunkReqs++;
        const t = r.request().timing();
        if (t.responseEnd > 0) fetchMs.push(t.responseEnd);
      }
    } catch { /* aborted */ }
  });
  // Pin the quality before boot so the initial download reflects it.
  await page.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, quality);
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120000 });
  const initial = { timeToPlayableMs: Date.now() - t0, requests, bytesUncompressed: bytes, bytesTransferred: transferred, chunkRequests: chunkReqs };
  await page.click('#btn-start');
  await page.evaluate(() => {
    const el = document.getElementById('opt-adaptive') as HTMLInputElement;
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  const m = await page.evaluate(({ ROUTE, seconds }) => new Promise<any>((resolve) => {
    const k = (window as any).__k3d;
    const gl: WebGL2RenderingContext = k.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const gpu: number[] = [], cpu: number[] = [], frame: number[] = [], calls: number[] = [], tris: number[] = [];
    const pending: WebGLQuery[] = [];
    let heapPeak = 0, geoMax = 0, texMax = 0, waiting = 0, dist = 0, stuckT = 0, rescues = 0;
    // GPU time: one timer query around each render call. CPU time: the whole rAF callback.
    const origRender = k.renderer.render.bind(k.renderer);
    k.renderer.render = (s: any, c: any) => {
      let q: WebGLQuery | null = null;
      if (ext && pending.length < 8) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q!); }
      origRender(s, c);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
      calls.push(k.renderer.info.render.calls);
      tris.push(k.renderer.info.render.triangles);
    };
    const origRaf = window.requestAnimationFrame.bind(window);
    let done = false;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => origRaf((t) => {
      const a = performance.now();
      cb(t);
      if (!done) cpu.push(performance.now() - a);
    });
    k.player.teleport(ROUTE[0][0], ROUTE[0][1]);
    k.tpc.pitch = 0.16;
    let wp = 1, last = performance.now(), lx = ROUTE[0][0], lz = ROUTE[0][1];
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      frame.push(now - last);
      last = now;
      const p = k.player.position;
      const moved = Math.hypot(p.x - lx, p.z - lz);
      dist += moved; lx = p.x; lz = p.z;
      // Stuck guard: if the runner is wedged for a second, hop to the next waypoint (counted, so a bad route is visible).
      stuckT = moved < 0.005 ? stuckT + frame[frame.length - 1] : 0;
      if (stuckT > 1000) { stuckT = 0; rescues++; k.player.teleport(ROUTE[wp][0], ROUTE[wp][1]); lx = p.x; lz = p.z; }
      let dx = ROUTE[wp][0] - p.x, dz = ROUTE[wp][1] - p.z;
      if (Math.hypot(dx, dz) < 4 && wp < ROUTE.length - 1) { wp++; dx = ROUTE[wp][0] - p.x; dz = ROUTE[wp][1] - p.z; }
      // The player runs toward the camera's forward direction, so steer by easing the camera yaw.
      const want = Math.atan2(-dx, -dz);
      let d = want - k.tpc.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      k.tpc.yaw += d * Math.min(1, (frame[frame.length - 1] / 1000) * 4);
      k.input.touchY = 1; k.input.touchRun = true;
      if (k.player.blocked === 'loading') waiting++;
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q); pending.shift();
      }
      const mem = (performance as any).memory;
      if (mem) heapPeak = Math.max(heapPeak, mem.usedJSHeapSize);
      geoMax = Math.max(geoMax, k.renderer.info.memory.geometries);
      texMax = Math.max(texMax, k.renderer.info.memory.textures);
      if (now - t0 < seconds * 1000) return origRaf(tick);
      done = true;
      k.input.touchY = 0; k.input.touchRun = false;
      const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
      const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
      const sorted = [...frame].sort((x, y) => x - y);
      const worst = sorted.slice(Math.floor(sorted.length * 0.99));
      resolve({
        frames: frame.length, distanceM: +dist.toFixed(0), stuckRescues: rescues,
        fpsAvg: +(1000 / avg(frame)).toFixed(1), fpsP1Low: +(1000 / avg(worst)).toFixed(1),
        frameMsAvg: +avg(frame).toFixed(2), frameMsP95: +pct(frame, 0.95).toFixed(2), frameMsP99: +pct(frame, 0.99).toFixed(2), frameMsMax: +sorted[sorted.length - 1].toFixed(1),
        framesOver33ms: frame.filter((v) => v > 33.4).length, framesOver50ms: frame.filter((v) => v > 50).length,
        cpuFrameMsAvg: +avg(cpu).toFixed(2), cpuFrameMsP99: +pct(cpu, 0.99).toFixed(2),
        gpuFrameMsAvg: gpu.length ? +avg(gpu).toFixed(2) : null, gpuFrameMsP99: gpu.length ? +pct(gpu, 0.99).toFixed(2) : null,
        gpuTimer: ext ? `EXT_disjoint_timer_query_webgl2 (${gpu.length} samples)` : 'unavailable',
        drawCallsAvg: Math.round(avg(calls)), drawCallsMax: Math.max(...calls), trianglesAvg: Math.round(avg(tris)), trianglesMax: Math.max(...tris),
        heapPeakMB: heapPeak ? +(heapPeak / 1048576).toFixed(1) : null, geometriesMax: geoMax, texturesMax: texMax, waiting,
        pixelRatio: +k.renderer.getPixelRatio().toFixed(2), stats: { ...k.world.chunks.stats },
      });
    };
    origRaf(tick);
  }), { ROUTE, seconds });

  await ctx.close();
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const { stats, waiting, ...rest } = m;
  return {
    session, quality, viewport: ctxOpts.viewport, deviceScaleFactor: ctxOpts.deviceScaleFactor ?? 1, seconds, ...rest, initial,
    streaming: {
      chunksFetched: stats.fetched, chunksBuilt: stats.built, chunkBuildMsMax: +stats.maxBuildMs.toFixed(1),
      chunkFetchMsAvg: +avg(fetchMs).toFixed(1), chunkFetchMsMax: +Math.max(0, ...fetchMs).toFixed(1), framesWaitingOnChunk: waiting,
      totalBytesUncompressed: bytes, totalBytesTransferred: transferred,
    },
    consoleErrors: [...new Set(errors)].slice(0, 10),
  };
}

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--enable-webgl-draft-extensions', ...(vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'])],
});
const probe = await browser.newPage();
const gpuName = await probe.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
await probe.close();
const results: Result[] = [];
results.push(await run(browser, 'desktop 1920x1080', { viewport: { width: 1920, height: 1080 } }, 'high'));
results.push(await run(browser, 'desktop 1920x1080', { viewport: { width: 1920, height: 1080 } }, 'medium'));
results.push(await run(browser, 'mobile viewport 390x844 @3x (emulated on desktop GPU)', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'low'));
await browser.close();

const all = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
all[label] = {
  measuredAt: new Date().toISOString(), url,
  machine: { gpu: gpuName, cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 2 ** 30), os: `${os.type()} ${os.release()}` },
  note: `${vsync ? 'vsync on (frame rate capped at the display refresh)' : 'vsync disabled (uncapped)'}; adaptive resolution off; mobile session is an emulated viewport on the desktop GPU, not a physical phone`,
  results,
};
writeFileSync(out, JSON.stringify(all, null, 2));
for (const r of results) console.log(`${label} | ${r.session} ${r.quality}: ${r.fpsAvg} fps avg, ${r.fpsP1Low} 1% low, p99 ${r.frameMsP99} ms, cpu ${r.cpuFrameMsAvg} ms, gpu ${r.gpuFrameMsAvg} ms, calls ${r.drawCallsAvg}/${r.drawCallsMax}, heap ${r.heapPeakMB} MB, dist ${r.distanceM} m (rescues ${r.stuckRescues}), >33ms ${r.framesOver33ms}, initial ${(r.initial.bytesUncompressed / 1e6).toFixed(2)} MB`);
