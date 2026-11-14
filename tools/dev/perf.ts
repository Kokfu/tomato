// Performance measurement harness. Writes docs/perf-results.json.
// Usage: node tools/dev/perf.ts [--url=http://localhost:4173/]   (run against `npm run preview` for production numbers)
// Frame-rate numbers are taken with vsync disabled so they show headroom above the display refresh rate.
import { chromium } from '@playwright/test';
import type { Page, Browser } from '@playwright/test';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';

const url = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:5173/';
const DATA = 'public/data/kuching';
const gz = (path: string) => gzipSync(readFileSync(path)).length;

// ---- static asset sizes --------------------------------------------------------------------------
const sizes: Record<string, unknown> = {};
{
  const chunkDir = `${DATA}/chunks`;
  let raw = 0, zipped = 0, max = 0, maxGz = 0, n = 0;
  for (const f of readdirSync(chunkDir)) {
    const s = statSync(`${chunkDir}/${f}`).size, g = gz(`${chunkDir}/${f}`);
    raw += s; zipped += g; max = Math.max(max, s); maxGz = Math.max(maxGz, g); n++;
  }
  sizes.chunks = { count: n, rawTotal: raw, gzipTotal: zipped, rawAvg: Math.round(raw / n), gzipAvg: Math.round(zipped / n), rawMax: max, gzipMax: maxGz };
  const core: Record<string, { raw: number; gzip: number }> = {};
  for (const f of readdirSync(DATA)) {
    const p = `${DATA}/${f}`;
    if (statSync(p).isFile()) core[f] = { raw: statSync(p).size, gzip: gz(p) };
  }
  sizes.dataFiles = core;
  if (existsSync('dist/assets')) {
    const app: Record<string, { raw: number; gzip: number }> = {};
    let total = 0, totalGz = 0;
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = `${dir}/${f}`;
        if (statSync(p).isDirectory()) { if (!p.startsWith('dist/data')) walk(p); continue; }
        const s = statSync(p).size, g = gz(p);
        app[p.replace('dist/', '')] = { raw: s, gzip: g };
        total += s; totalGz += g;
      }
    };
    walk('dist');
    sizes.appBuild = { files: app, rawTotal: total, gzipTotal: totalGz };
  }
}

// ---- runtime measurements ------------------------------------------------------------------------
interface Sample { label: string; quality: string; fpsAvg: number; fpsP1Low: number; frameMsP95: number; frameMsP99: number; frameMsMax: number; framesOver33ms: number; frames: number; calls: number; triangles: number; geometries: number; textures: number; chunks: number; heapMB: number | null; pixelRatio: number }

async function measure(page: Page, label: string, quality: string, view: { lm?: string; x?: number; z?: number; yaw?: number; move?: boolean }): Promise<Sample> {
  await page.evaluate(({ quality, view }) => {
    const k = (window as any).__k3d;
    (document.querySelector(`#quality-seg [data-q="${quality}"]`) as HTMLElement).click();
    (document.getElementById('opt-adaptive') as HTMLInputElement).checked = false;
    document.getElementById('opt-adaptive')!.dispatchEvent(new Event('change'));
    if (view.lm) { const l = k.world.landmarks.landmarks.find((x: any) => x.id === view.lm); k.player.teleport(l.x, l.z); }
    else if (view.x !== undefined) k.player.teleport(view.x, view.z);
    else k.player.teleport(k.world.manifest.spawn.x, k.world.manifest.spawn.z);
    k.tpc.yaw = view.yaw ?? 0;
    k.tpc.pitch = 0.2;
  }, { quality, view });
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  return page.evaluate(({ label, quality, move }) => new Promise<any>((resolve) => {
    const k = (window as any).__k3d;
    const times: number[] = [];
    let last = performance.now();
    const t0 = last;
    let yaw0 = k.tpc.yaw;
    const tick = () => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      // Slowly pan the camera (and optionally run) so culling and streaming are exercised.
      k.tpc.yaw = yaw0 + ((now - t0) / 6000) * Math.PI * 2;
      if (move) { k.input.touchY = 1; k.input.touchRun = true; }
      if (now - t0 < 6000) return requestAnimationFrame(tick);
      k.input.touchY = 0; k.input.touchRun = false;
      times.sort((a, b) => a - b);
      const avg = times.reduce((s, v) => s + v, 0) / times.length;
      const worst = times.slice(Math.floor(times.length * 0.99));
      const r = k.renderer.info;
      resolve({
        label, quality, fpsAvg: +(1000 / avg).toFixed(1), fpsP1Low: +(1000 / (worst.reduce((s, v) => s + v, 0) / worst.length)).toFixed(1),
        frameMsP95: +times[Math.floor(times.length * 0.95)].toFixed(2), frameMsP99: +times[Math.floor(times.length * 0.99)].toFixed(2), frameMsMax: +times[times.length - 1].toFixed(1), framesOver33ms: times.filter((v) => v > 33.4).length, frames: times.length, calls: r.render.calls, triangles: r.render.triangles,
        geometries: r.memory.geometries, textures: r.memory.textures, chunks: k.world.chunks.loadedCount,
        heapMB: (performance as any).memory ? +((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        pixelRatio: +k.renderer.getPixelRatio().toFixed(2),
      });
    };
    requestAnimationFrame(tick);
  }), { label, quality, move: !!view.move });
}

async function session(browser: Browser, name: string, ctxOpts: any, cpuThrottle: number, qualities: string[]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  let bytes = 0, requests = 0, chunkBytes = 0, chunkReqs = 0;
  page.on('response', async (r) => {
    try {
      const b = (await r.body()).length;
      bytes += b; requests++;
      if (r.url().includes('/chunks/')) { chunkBytes += b; chunkReqs++; }
    } catch { /* aborted */ }
  });
  if (cpuThrottle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120000 });
  const readyMs = Date.now() - t0;
  const initial = { timeToPlayableMs: readyMs, requests, bytesUncompressed: bytes, chunkRequests: chunkReqs, chunkBytesUncompressed: chunkBytes, defaultQuality: await page.evaluate(() => document.querySelector('#quality-seg .active')?.getAttribute('data-q')) };
  await page.click('#btn-start');
  const samples: Sample[] = [];
  for (const q of qualities) {
    samples.push(await measure(page, 'Waterfront (river + bridge view)', q, { yaw: 0 }));
    samples.push(await measure(page, 'Main Bazaar / Carpenter Street (dense old town)', q, { lm: 'carpenter-street' }));
    samples.push(await measure(page, 'Running along Jalan Padungan (streaming)', q, { lm: 'jalan-padungan', move: true }));
    // Densest machine-detected (Overture) residential area: chunk 12,-1 holds the most footprints.
    samples.push(await measure(page, 'Dense suburb, machine-detected buildings', q, { x: 3200, z: -128 }));
    samples.push(await measure(page, 'Running through dense suburb (streaming)', q, { x: 3200, z: -128, yaw: 1.6, move: true }));
  }
  const streaming = await page.evaluate(() => ({ ...(window as any).__k3d.world.chunks.stats }));
  await ctx.close();
  return { name, cpuThrottle, viewport: ctxOpts.viewport, deviceScaleFactor: ctxOpts.deviceScaleFactor ?? 1, initial, samples, streaming, consoleErrors: errors };
}

const BASE_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
async function runAll(vsync: boolean) {
  const browser = await chromium.launch({ channel: 'msedge', args: vsync ? BASE_ARGS : [...BASE_ARGS, '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const p = await browser.newPage();
  const renderer = await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const userAgent = await p.evaluate(() => navigator.userAgent);
  await p.close();
  const runs = [
    await session(browser, 'desktop-1920x1080', { viewport: { width: 1920, height: 1080 } }, 1, ['low', 'medium', 'high']),
    await session(browser, 'laptop-1366x768', { viewport: { width: 1366, height: 768 } }, 1, ['medium']),
    await session(browser, 'mobile-390x844-emulated', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 4, ['low', 'medium']),
    await session(browser, 'mobile-360x800-emulated', { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 4, ['low']),
  ];
  await browser.close();
  return { renderer, userAgent, runs };
}
const uncapped = await runAll(false);
const vsynced = await runAll(true);
const gpu = { renderer: uncapped.renderer, userAgent: uncapped.userAgent };

const results = {
  generatedAt: new Date().toISOString(),
  url,
  machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}`, gpu: gpu.renderer, browser: gpu.userAgent },
  note: 'runsUncapped: headless Edge with vsync disabled (average fps shows headroom; frame-time spikes in this mode are an artefact of uncapped presentation). runsVsync: normal 60 Hz presentation (use these for frame-time stability). Mobile rows are desktop-hardware emulation (viewport, DPR 3, touch, 4x CPU throttle), not a physical phone.',
  sizes,
  runsUncapped: uncapped.runs,
  runsVsync: vsynced.runs,
};
writeFileSync('docs/perf-results.json', JSON.stringify(results, null, 1));
for (const [mode, runs] of [['UNCAPPED', results.runsUncapped], ['VSYNC', results.runsVsync]] as const) {
  console.log(`
=== ${mode} ===`);
  for (const r of runs) {
    console.log(`${r.name} (cpu x${r.cpuThrottle}) playable in ${r.initial.timeToPlayableMs} ms, ${r.initial.requests} requests, ${(r.initial.bytesUncompressed / 1e6).toFixed(2)} MB uncompressed (chunks ${(r.initial.chunkBytesUncompressed / 1e6).toFixed(2)} MB / ${r.initial.chunkRequests})`);
    for (const s of r.samples) console.log(`  ${s.quality.padEnd(6)} ${s.label.padEnd(48)} ${String(s.fpsAvg).padStart(6)} fps  p99 ${String(s.frameMsP99).padStart(5)} ms  max ${String(s.frameMsMax).padStart(5)} ms  >33ms: ${s.framesOver33ms}/${s.frames}  calls ${s.calls} tris ${s.triangles} chunks ${s.chunks} heap ${s.heapMB} MB`);
    if (r.consoleErrors.length) console.log('  errors:', r.consoleErrors.slice(0, 3));
  }
}
console.log('GPU:', gpu.renderer);
