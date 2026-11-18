// V8.1 driving benchmark: repeatable driving scenarios with per-frame attribution of where the time went.
// Serves a production build with `vite preview` (spawned here), drives the real car through the normal input path
// (tests/e2e/driving-helpers.ts driveRoute, real time) and records every frame.
//
// Usage: node tools/dev/drive-bench.ts [--dist=dist] [--port=4181] [--out=test-results/drive-bench.json]
//        [--scenarios=A,B,C,D] [--quality=medium] [--runs=2]
// Scenarios: A stationary at Jalan China, B the 88 m Jalan China lane, C the block loop (Carpenter, Bishopgate,
// Main Bazaar), D the 2 km high-speed run on Jalan Tun Abang Haji Openg (crosses many chunk borders).
// Every scenario runs `runs` times in the same page: run 1 is cold (fresh browser profile: empty HTTP cache, no
// compiled shaders, chunks never built), later runs are warm (HTTP cache and shader programs warm, chunk meshes
// rebuilt as they stream in again).
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { driveRoute, waysNamed, placeCar } from '../../tests/e2e/driving-helpers.ts';
import { chainOfWays } from '../../tests/e2e/helpers.ts';
import { CHINA } from '../../src/v5/geo.ts';

const opt = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DIST = opt('dist', 'dist'), PORT = +opt('port', '4181'), OUT = opt('out', 'test-results/drive-bench.json');
const SCEN = opt('scenarios', 'A,B,C,D').split(','), QUALITY = opt('quality', 'medium'), RUNS = +opt('runs', '2');
/** --dev: run against the Vite dev server (as the e2e suite does) instead of a production build. */
const DEV = process.argv.includes('--dev');
/** --trace=file.json: record a Chrome trace (all processes, GPU included) of the first scenario of the first run. */
const TRACE = opt('trace', '');
/** --cpu=4: CPU throttling through the DevTools protocol (low frame-rate runs). */
const CPU = +opt('cpu', '1');
/** --gps=fort-margherita: V8.4 builds only: keep a GPS (driving) route to this landmark active during every scenario. */
const GPS = opt('gps', '');
/** --mobile: V8.5 phone emulation (390x844 CSS px, DPR 3, touch, mobile viewport); pair with --quality=low --cpu=4. Emulated, not a real phone. */
const MOBILE = process.argv.includes('--mobile');

const BLOCK_LOOP: [number, number][] = [
  [176, 34], [180.2, 36.4], [183, 37.4], [256, 54.8], [264, 56.7],
  [279.3, 7.7], [282.1, 0], [288.8, -17.8], [256, -41.5], [218.2, -68.7], [205.6, -49.9],
];
const BLOCK_LOOP_V7: [number, number][] = [
  ...([[60, 0], [30, 0], [-4.5, 0], [-3.5, 8], [-3, 14]] as [number, number][]).map(([s, o]) => CHINA.toWorld(s, o)),
  ...BLOCK_LOOP,
];
const LANE: [number, number][] = ([[70, 0], [40, 0], [8, 0]] as [number, number][]).map(([s, o]) => CHINA.toWorld(s, o));

function highSpeedRoute(): [number, number][] {
  const { pts } = chainOfWays(waysNamed('Jalan Tun Abang Haji Openg'), [-411, 2475]);
  let skip = 0, acc = 0;
  while (acc < 150) { acc += Math.hypot(pts[skip + 1][0] - pts[skip][0], pts[skip + 1][1] - pts[skip][1]); skip++; }
  return pts.slice(skip);
}

/** In-page instrumentation: wraps the per-frame systems and closes one record per game frame. */
function instrument(): void {
  const w = window as any, k = w.__k3d, W = k.world, ch = W.chunks;
  if (w.__prof) return;
  const P: any = (w.__prof = { acc: {} as Record<string, number>, frames: [] as any[], builds: [] as any[], loaf: [] as any[], on: false, last: 0 });
  const wrap = (obj: any, name: string, label: string, onDone?: (ms: number, args: any[]) => void) => {
    const f = obj?.[name];
    if (typeof f !== 'function') { console.warn('bench: cannot wrap', label); return; }
    obj[name] = function (...a: any[]) {
      const t = performance.now();
      try { return f.apply(this, a); } finally {
        const d = performance.now() - t;
        P.acc[label] = (P.acc[label] ?? 0) + d;
        onDone?.(d, a);
      }
    };
  };
  // V8.3 camera quality, sampled on the frame just drawn: [cam y - car y, boom length, view yaw, view pitch,
  // inside a building / parked car (0/1), wall between car and camera (0/1), nearest wall within 0.4 m of the camera (m, 9 = none)].
  const cdir = new (k.camera.position.constructor)();
  const camSample = () => {
    const d = k.driving, car = d.car, cam = k.camera, C = W.collision;
    if (!d.active) return null;
    const p = cam.position;
    cam.getWorldDirection(cdir);
    const inside = C.insideBuilding(p.x, p.z, p.y, false) ? 1 : 0;
    const py = car.y + 1.0;
    const occl = C.rayWalls(car.x, py, car.z, p.x - car.x, p.y - py, p.z - car.z) < 0.97 ? 1 : 0;
    let near = 9;
    for (let a = 0; a < 8; a++) { const t = C.rayWalls(p.x, p.y, p.z, Math.cos(a * 0.785) * 0.4, 0, Math.sin(a * 0.785) * 0.4); if (t < 1) near = Math.min(near, t * 0.4); }
    return [+(p.y - car.y).toFixed(3), +Math.hypot(p.x - car.x, p.y - py, p.z - car.z).toFixed(3), +Math.atan2(cdir.x, cdir.z).toFixed(4), +Math.asin(cdir.y).toFixed(4), inside, occl, +near.toFixed(2)];
  };
  // Frame boundary: the game loop calls world.update first thing every frame.
  const upd = W.update;
  W.update = function (...a: any[]) {
    const now = performance.now();
    if (P.on && P.last) {
      const info = k.renderer.info, car = k.driving.car, mem = (performance as any).memory;
      P.frames.push({
        t: +(now).toFixed(1), dt: +(now - P.last).toFixed(2), sp: +Math.abs(car.vf).toFixed(1),
        calls: info.render.calls, tris: info.render.triangles, progs: info.programs?.length ?? 0,
        geo: info.memory.geometries, tex: info.memory.textures, heap: mem ? Math.round(mem.usedJSHeapSize / 1e5) / 10 : 0,
        built: ch.stats.built, fetched: ch.stats.fetched, chunks: ch.loadedCount, cam: camSample(),
        ...Object.fromEntries(Object.entries(P.acc).map(([key, v]) => [key, +(v as number).toFixed(2)])),
      });
      // Names of the shader programs compiled during this frame.
      const progs = info.programs ?? [];
      if (P.progN !== undefined && progs.length > P.progN) { const f = P.frames[P.frames.length - 1]; f.pn = progs.slice(P.progN).map((p: any) => p.name || String(p.cacheKey).split(',').slice(0, 3).join('/').slice(0, 60)); f.at = [Math.round(car.x), Math.round(car.z)]; }
      P.progN = progs.length;
    }
    P.acc = {};
    P.last = now;
    const t = performance.now();
    try { return upd.apply(this, a); } finally { P.acc['world.update'] = performance.now() - t; }
  };
  wrap(ch, 'update', 'chunks.update');
  wrap(ch, 'recomputeWanted', 'recompute');
  // Per-stage time of each build (V8.2): the delta of ChunkManager.buildProfile across the call.
  const stages = () => ({ ...ch.buildProfile });
  let bp0: Record<string, number> = stages();
  const delta = () => { const now = stages(), d: Record<string, number> = {}; for (const [key, v] of Object.entries(now)) { const x = (v as number) - (bp0[key] ?? 0); if (x > 0.05) d[key] = +x.toFixed(2); } bp0 = now; return d; };
  if (typeof ch.build === 'function' && !('jobLog' in ch)) wrap(ch, 'build', 'build', (ms, a) => { const prof = delta(); if (P.on) P.builds.push({ kind: 'build', key: a[0].key, detail: a[1], ms: +ms.toFixed(2), prof, t: performance.now() }); });
  if (!('jobLog' in ch)) wrap(ch, 'decorate', 'decor', (ms, a) => { const prof = delta(); if (P.on) P.builds.push({ kind: 'decor', key: a[0].key, ms: +ms.toFixed(2), prof, t: performance.now() }); });
  // V8.2 and later: builds run as jobs over several frames. 'build' = time in the job runner this frame; every finished
  // job is read from ChunkManager.jobLog (ms = the most of it done in one frame, totalMs = all its frames).
  if ('jobLog' in ch) { ch.jobLog = []; if (typeof ch.runJobs === 'function') wrap(ch, 'runJobs', 'build'); }
  wrap(ch, 'disposeMesh', 'dispose');
  wrap(ch, 'unload', 'unload');
  wrap(W.collision, 'addChunk', 'col.add');
  wrap(W.collision, 'removeChunk', 'col.remove');
  wrap(W.landmarkModels, 'update', 'lmModels');
  wrap(W.materials, 'update', 'mats');
  wrap(k.v5, 'update', 'v5.update');
  wrap(k.renderer, 'render', 'render');
  if (k.v5?.pipeline) wrap(k.v5.pipeline, 'render', 'pipeline');
  wrap(k.driving, 'drive', 'physics');
  wrap(k.driving.camera, 'update', 'camera');
  wrap(k.minimap, 'update', 'minimap');
  if (ch.onChunkData) wrap(ch, 'onChunkData', 'onChunkData');
  if (ch.onChunkRemoved) wrap(ch, 'onChunkRemoved', 'onChunkRemoved');
  const parse = JSON.parse;
  JSON.parse = function (...a: any[]) {
    const t = performance.now();
    try { return (parse as any).apply(JSON, a); } finally { P.acc['json.parse'] = (P.acc['json.parse'] ?? 0) + performance.now() - t; }
  } as any;
  try {
    new PerformanceObserver((list) => {
      if (!P.on) return;
      for (const e of list.getEntries() as any[]) {
        P.loaf.push({
          t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1), block: +(e.blockingDuration ?? 0).toFixed(1),
          render: e.renderStart ? +(e.startTime + e.duration - e.renderStart).toFixed(1) : 0,
          style: e.styleAndLayoutStart ? +(e.startTime + e.duration - e.styleAndLayoutStart).toFixed(1) : 0,
          scripts: (e.scripts ?? []).slice(0, 4).map((s: any) => ({ inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, ms: +s.duration.toFixed(1), forced: +(s.forcedStyleAndLayoutDuration ?? 0).toFixed(1) })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* LoAF unsupported */ }
}

const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];

function summarise(frames: any[], builds: any[], loaf: any[]) {
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const total = frames.reduce((s, f) => s + f.dt, 0);
  const keys = ['world.update', 'chunks.update', 'build', 'decor', 'dispose', 'unload', 'recompute', 'col.add', 'col.remove', 'json.parse', 'onChunkData', 'onChunkRemoved', 'lmModels', 'v5.update', 'physics', 'camera', 'minimap', 'render', 'pipeline'];
  const sum = (key: string, fr = frames) => fr.reduce((s, f) => s + (f[key] ?? 0), 0);
  const slow = frames.filter((f) => f.dt > 50);
  const attrib = (fr: any[]) => Object.fromEntries(keys.map((key) => [key, +sum(key, fr).toFixed(1)]).filter(([, v]) => (v as number) > 0.05));
  const b = builds.filter((x) => x.kind === 'build').map((x) => x.ms).sort((a, c) => a - c);
  const d = builds.filter((x) => x.kind === 'decor').map((x) => x.ms).sort((a, c) => a - c);
  const worst = [...frames].sort((a, c) => c.dt - a.dt).slice(0, 8).map((f) => {
    const parts = Object.fromEntries(keys.filter((key) => (f[key] ?? 0) > 1).map((key) => [key, f[key]]));
    const prev = frames[frames.indexOf(f) - 1];
    return { dt: f.dt, sp: f.sp, ...parts, pn: f.pn, newProgs: prev ? f.progs - prev.progs : 0, newGeo: prev ? f.geo - prev.geo : 0, newTex: prev ? f.tex - prev.tex : 0, builtΔ: prev ? f.built - prev.built : 0 };
  });
  // Camera: per-frame changes of height-above-car and boom length (jitter shows as sign reversals of the change),
  // angular acceleration of the view (rad/s^2), frames clipped / occluded / with a wall within 0.4 m.
  const cf = frames.filter((f) => f.cam);
  let hRev = 0, bRev = 0, maxBoomJump = 0, maxHJump = 0; const angAcc: number[] = [];
  for (let i = 2; i < cf.length; i++) {
    const a = cf[i - 2].cam, b = cf[i - 1].cam, c = cf[i].cam;
    const dh1 = b[0] - a[0], dh2 = c[0] - b[0], db1 = b[1] - a[1], db2 = c[1] - b[1];
    if (dh1 * dh2 < 0 && Math.abs(dh1) > 0.01 && Math.abs(dh2) > 0.01) hRev++;
    if (db1 * db2 < 0 && Math.abs(db1) > 0.03 && Math.abs(db2) > 0.03) bRev++;
    maxBoomJump = Math.max(maxBoomJump, Math.abs(db2)); maxHJump = Math.max(maxHJump, Math.abs(dh2));
    const w = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    const t1 = cf[i - 1].dt / 1000, t2 = cf[i].dt / 1000;
    const wy = (w(c[2] - b[2]) / t2 - w(b[2] - a[2]) / t1) / ((t1 + t2) / 2), wp = ((c[3] - b[3]) / t2 - (b[3] - a[3]) / t1) / ((t1 + t2) / 2);
    angAcc.push(Math.hypot(wy, wp));
  }
  angAcc.sort((x, y) => x - y);
  const camera = cf.length < 3 ? null : {
    frames: cf.length, inside: cf.filter((f) => f.cam[4]).length, occluded: cf.filter((f) => f.cam[5]).length, wallWithin02: cf.filter((f) => f.cam[6] < 0.2).length, wallWithin04: cf.filter((f) => f.cam[6] < 0.4).length,
    heightReversals: hRev, boomReversals: bRev, maxBoomJump: +maxBoomJump.toFixed(2), maxHeightJump: +maxHJump.toFixed(3),
    angAccMedian: +pct(angAcc, 50).toFixed(2), angAccP95: +pct(angAcc, 95).toFixed(1), angAccP99: +pct(angAcc, 99).toFixed(1),
    boomMedian: +pct(cf.map((f) => f.cam[1]).sort((x, y) => x - y), 50).toFixed(2),
  };
  return {
    camera,
    frames: frames.length, seconds: +(total / 1000).toFixed(1), avgFps: +((frames.length / total) * 1000).toFixed(1),
    medianMs: +pct(dts, 50).toFixed(1), p95Ms: +pct(dts, 95).toFixed(1), p99Ms: +pct(dts, 99).toFixed(1), worstMs: +dts[dts.length - 1].toFixed(1),
    over50: dts.filter((x) => x > 50).length, over100: dts.filter((x) => x > 100).length, over200: dts.filter((x) => x > 200).length,
    chunkBuilds: b.length, buildMsMedian: b.length ? +pct(b, 50).toFixed(1) : 0, buildMsMax: b.length ? +b[b.length - 1].toFixed(1) : 0,
    decors: d.length, decorMsMax: d.length ? +d[d.length - 1].toFixed(1) : 0,
    stageMax: builds.reduce((m: Record<string, number>, x: any) => { for (const [key, v] of Object.entries(x.prof ?? {})) m[key] = Math.max(m[key] ?? 0, v as number); return m; }, {}),
    worstBuilds: [...builds].sort((a: any, c: any) => c.ms - a.ms).slice(0, 6).map((x: any) => ({ kind: x.kind, key: x.key, detail: x.detail, ms: x.ms, totalMs: x.totalMs, frames: x.frames, ...x.prof })),
    buildTotalMsMax: Math.max(0, ...builds.map((x: any) => x.totalMs ?? x.ms)),
    peakHeapMB: Math.max(...frames.map((f) => f.heap)), maxCalls: Math.max(...frames.map((f) => f.calls)), avgCalls: Math.round(sum('calls') / frames.length),
    maxTrisK: Math.round(Math.max(...frames.map((f) => f.tris)) / 1000), programs: [frames[0]?.progs, frames[frames.length - 1]?.progs],
    msPerFrame: Object.fromEntries(Object.entries(attrib(frames)).map(([key, v]) => [key, +((v as number) / frames.length).toFixed(2)])),
    slowFrameAttribution: { n: slow.length, totalMs: +sum('dt', slow).toFixed(0), ...attrib(slow) },
    worst,
    compiles: frames.filter((f) => f.pn).map((f) => ({ dt: f.dt, t: Math.round(f.t), at: f.at, programs: f.pn.join(' | ') })),
    loaf: loaf.sort((a, c) => c.ms - a.ms).slice(0, 6),
  };
}

async function run(page: Page, name: string, fn: () => Promise<any>) {
  await page.evaluate(() => { const P = (window as any).__prof, ch = (window as any).__k3d.world.chunks; P.frames = []; P.builds = []; P.loaf = []; P.last = 0; P.on = true; if (ch.jobLog) ch.jobLog = []; });
  const res = await fn();
  const { frames, builds, loaf } = await page.evaluate(() => {
    const P = (window as any).__prof, ch = (window as any).__k3d.world.chunks;
    P.on = false;
    const jobs = (ch.jobLog ?? []).map((j: any) => ({ kind: j.kind, key: j.key, detail: j.detail, ms: +j.maxFrameMs.toFixed(2), totalMs: +j.ms.toFixed(2), frames: j.frames, prof: Object.fromEntries(Object.entries(j.prof).map(([k, v]) => [k, +(v as number).toFixed(2)])) }));
    return { frames: P.frames.slice(3), builds: ch.jobLog ? jobs : P.builds, loaf: P.loaf };
  });
  const s = summarise(frames, builds, loaf);
  const collision = res && typeof res === 'object' && 'reached' in res
    ? { reached: res.reached, distance: Math.round(res.distance), maxKmh: +res.maxKmh.toFixed(0), everInBuilding: res.everInBuilding, everInWater: res.everInWater, blocked: res.blocked, impacts: res.impacts, maxImpact: +res.maxImpact.toFixed(1), unbuiltFrames: res.unbuiltFrames, offRoadFrames: res.offRoadFrames, recoveries: res.recoveries, maxHeightError: +res.maxHeightError.toFixed(2) }
    : res;
  console.log(`\n=== ${name}\n${JSON.stringify({ ...s, worst: undefined, loaf: undefined, collision })}`);
  for (const w of s.worst.slice(0, 5)) console.log('  worst', JSON.stringify(w));
  for (const b of s.worstBuilds) console.log('  build', JSON.stringify(b));
  for (const c of s.compiles) console.log('  compile', JSON.stringify(c));
  return { name, ...s, collision, frameTimes: frames.map((f: any) => [Math.round(f.t), f.dt, f.sp]) };
}

async function toCar(page: Page) {
  await page.evaluate(() => { const k = (window as any).__k3d, c = k.driving.car; k.player.teleport(c.x - Math.cos(c.heading) * 1.9, c.z + Math.sin(c.heading) * 1.9); k.tpc.snap(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  if (!(await page.evaluate(() => (window as any).__k3d.driving.active))) throw new Error('could not get in the car');
}
async function waitChunks(page: Page) {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => { const k = (window as any).__k3d, p = k.player.position; return k.world.chunks.isReady(p.x, p.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 120_000 });
}
async function leaveCar(page: Page) {
  await page.evaluate(() => { const k = (window as any).__k3d; if (k.driving.active) { k.driving.car.vf = k.driving.car.vl = 0; k.driving.exit(k.player, true); } });
}

const server = spawn('npx', DEV ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'pipe' });
server.stdout.resume();
server.stderr.resume();
// Ready once it answers (its console line can carry colour codes inside the port number).
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not yet */ }
  if (i > 240) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 500));
}
const results: any[] = [];
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
try {
  const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : { viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript((q) => { try { localStorage.setItem('k3d.quality', q); } catch { /* ignore */ } }, QUALITY);
  const page = await ctx.newPage();
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('bench')) console.log('[page]', m.text()); });
  const tLoad = Date.now();
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120_000 });
  const loadMs = Date.now() - tLoad;
  const programsAtReady = await page.evaluate(() => (window as any).__k3d.renderer.info.programs.length);
  await page.click('#btn-start');
  await page.evaluate(() => { const el = document.getElementById('opt-adaptive') as HTMLInputElement | null; if (el?.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
  await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
  await page.evaluate(instrument);
  const start = await page.evaluate(() => { const c = (window as any).__k3d.driving.car; return { x: c.x, z: c.z, h: c.heading }; });
  const hs = highSpeedRoute();
  for (let runNo = 1; runNo <= RUNS; runNo++) {
    const tag = runNo === 1 ? 'cold' : `warm${runNo - 1}`;
    for (const sc of SCEN) {
      // Every scenario starts from a settled world at its starting place.
      await leaveCar(page);
      if (sc === 'D') {
        const h0 = Math.atan2(hs[1][0] - hs[0][0], hs[1][1] - hs[0][1]);
        await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), hs[0]);
        await waitChunks(page);
        await placeCar(page, hs[0][0], hs[0][1], h0);
      } else {
        await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), [start.x - 3, start.z]);
        await waitChunks(page);
        await placeCar(page, start.x, start.z, start.h);
      }
      await toCar(page);
      if (GPS) {
        const ok = await page.evaluate(async (id) => {
          const k = (window as any).__k3d;
          if (!k.gps) return 'no GPS in this build';
          const nav = await k.minimap.routeTo(id, 'drive');
          return nav?.route ? 'ok' : `no route: ${nav?.reason}`;
        }, GPS);
        if (ok !== 'ok') console.log('bench: GPS', ok);
      }
      await page.waitForTimeout(1500);
      const tracing = TRACE && runNo === 1 && sc === SCEN[0];
      if (tracing) await browser.startTracing(page, { path: TRACE, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'v8', 'disabled-by-default-v8.gc', 'gpu', 'gpu.angle', 'disabled-by-default-gpu.angle', 'gpu.service', 'gpu.decoder', 'cc', 'viz', 'blink.user_timing'] });
      if (sc === 'A') results.push(await run(page, `A stationary ${tag}`, async () => { await page.waitForTimeout(10_000); return { stationary: true }; }));
      if (sc === 'B') results.push(await run(page, `B Jalan China lane ${tag}`, () => driveRoute(page, LANE, { speed: 8, realTime: true, maxSeconds: 60 })));
      if (sc === 'C') results.push(await run(page, `C block loop ${tag}`, () => driveRoute(page, BLOCK_LOOP_V7, { speed: 9, realTime: true, maxSeconds: 200 })));
      if (sc === 'D') results.push(await run(page, `D high-speed 2 km ${tag}`, () => driveRoute(page, hs, { speed: 27, cornerSpeed: 9, realTime: true, maxSeconds: 300, tolerance: 8 })));
      if (tracing) await browser.stopTracing();
      if (GPS) {
        const g = await page.evaluate(() => { const m = (window as any).__k3d.minimap; return m ? { routes: m.routeCount, lastRouteMs: m.lastRouteMs } : null; });
        if (g) results[results.length - 1].gps = g;
      }
    }
  }
  const meta = await page.evaluate(() => { const k = (window as any).__k3d; return { loadMs: 0, programsAtReady: 0, quality: k.world.chunks.quality.name, pixelRatio: k.renderer.getPixelRatio(), mode: k.v5?.mode, gl: (() => { const g = k.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; })() }; });
  meta.loadMs = loadMs; meta.programsAtReady = programsAtReady;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ meta, dist: DIST, when: new Date().toISOString(), results }, null, 1));
  console.log('\nmeta', JSON.stringify(meta), '\nwritten', OUT);
} finally {
  await browser.close();
  if (process.platform === 'win32') {
    // `npx` under a shell can leave vite in a separate tree: stop whatever listens on the port.
    const pids = new Set(execSync('netstat -ano').toString().split(/\r?\n/).filter((l) => l.includes(`:${PORT} `) && l.includes('LISTEN')).map((l) => l.trim().split(/\s+/).pop()));
    for (const pid of [server.pid, ...pids]) try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
  } else server.kill();
  process.exit(0);
}
