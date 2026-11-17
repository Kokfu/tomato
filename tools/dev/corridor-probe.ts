// V8.1 road-corridor investigation: samples the mapped centre lines of the tested driving routes every 2 m and
// measures, across the road, where the surface is really free (no building, five-foot-way pier or parked car) in the
// default V7 rendering. Reports how far the free corridor's middle lies from the OSM centre line, its width against
// the mapped width, the decks crossed (road bridge or footway at grade) and the slope. Changes nothing.
//
// Usage: node tools/dev/corridor-probe.ts [--dist=dist] [--out=test-results/corridor-probe.json]   (serves the build itself)
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { waysNamed } from '../../tests/e2e/driving-helpers.ts';
import { chainOfWays } from '../../tests/e2e/helpers.ts';

const opt = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DIST = opt('dist', 'dist'), PORT = 4185, OUT = opt('out', 'test-results/corridor-probe.json');

/** Block loop on the mapped centre lines (tests/e2e/driving.spec.ts BLOCK_LOOP, from the car). */
const BLOCK_LOOP: [number, number][] = [
  [205.6, -49.9], [190.5, -27.4], [172.1, 0], [156.8, 22.9], [176, 34], [180.2, 36.4], [183, 37.4], [256, 54.8], [264, 56.7],
  [279.3, 7.7], [282.1, 0], [288.8, -17.8], [256, -41.5], [218.2, -68.7], [205.6, -49.9],
];
function resample(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [pts[0]];
  for (let j = 1; j < pts.length; j++) {
    const a = pts[j - 1], b = pts[j], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let q = 1; q <= n; q++) out.push([a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n]);
  }
  return out;
}

async function sample(page: Page, pts: [number, number][]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < pts.length; i += 25) {
    const part = pts.slice(Math.max(0, i - 1), Math.min(pts.length, i + 26));
    await page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), part[Math.floor(part.length / 2)]);
    await page.waitForTimeout(100);
    await page.waitForFunction(() => { const k = (window as any).__k3d, p = k.player.position; return k.world.chunks.isReady(p.x, p.z) && k.world.chunks.progress() >= 0.999; }, null, { timeout: 120_000 });
    const rows = await page.evaluate(({ part, first }) => {
      const k = (window as any).__k3d, c = k.world.collision, H = k.world.height, d = k.driving;
      const res: any[] = [];
      for (let j = first ? 0 : 1; j < part.length - (part.length > 2 ? 1 : 0); j++) {
        const p = part[j], a = part[Math.max(0, j - 1)], b = part[Math.min(part.length - 1, j + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, fx = (b[0] - a[0]) / l, fz = (b[1] - a[1]) / l, nx = fz, nz = -fx;
        const g0 = c.groundAt(p[0], p[1], 1e6);
        const blocked = (o: number) => {
          const qx = p[0] + nx * o, qz = p[1] + nz * o, y = c.groundAt(qx, qz, g0.h + 1).h;
          return c.insideBuilding(qx, qz, y + 0.3, false) || !!c.boxContact(qx, qz, fx, fz, 0.25, 0.25, y);
        };
        // Free interval across the road: the one containing the centre line, else the nearest one within 6 m.
        let o0: number | null = null;
        for (let s = 0; s <= 48 && o0 === null; s++) { const o = (s % 2 ? -1 : 1) * Math.ceil(s / 2) * 0.25; if (!blocked(o)) o0 = o; }
        let lo = o0 ?? 0, hi = o0 ?? 0;
        if (o0 !== null) {
          while (lo > -15 && !blocked(lo - 0.25)) lo -= 0.25;
          while (hi < 15 && !blocked(hi + 0.25)) hi += 0.25;
        }
        const r = d.car.env.road(p[0], p[1]);
        res.push({
          x: +p[0].toFixed(1), z: +p[1].toFixed(1), road: r?.name ?? null, type: r?.type ?? null, mapped: r ? +r.width.toFixed(1) : 0, lineDist: r ? +r.dist.toFixed(2) : -1,
          free: o0 === null ? 0 : +(hi - lo + 0.25).toFixed(2), lo: +lo.toFixed(2), hi: +hi.toFixed(2), mid: o0 === null ? null : +((lo + hi) / 2).toFixed(2), lineFree: o0 === 0,
          h: +g0.h.toFixed(2), deck: g0.deck, deckAbove: +(g0.h - H.sample(p[0], p[1])).toFixed(2), bridge: !!r?.bridge,
        });
      }
      return res;
    }, { part, first: i === 0 });
    out.push(...rows);
  }
  return out;
}

function summarise(rows: any[]) {
  const by = new Map<string, any[]>();
  for (const r of rows) { const k = r.road ?? '(no drivable road)'; if (!by.has(k)) by.set(k, []); by.get(k)!.push(r); }
  const streets = [...by].map(([road, rs]) => {
    const free = rs.map((r) => r.free).sort((a, b) => a - b), mids = rs.filter((r) => r.mid !== null).map((r) => Math.abs(r.mid));
    return {
      road, samples: rs.length, mappedWidth: [...new Set(rs.map((r) => r.mapped))],
      centreLineBlocked: rs.filter((r) => !r.lineFree).length,
      freeWidthMin: free[0], freeWidthMedian: free[Math.floor(free.length / 2)],
      narrowerThanCarPlus08: rs.filter((r) => r.free < 1.73 + 0.8).length,
      freeMiddleOffsetMax: mids.length ? +Math.max(...mids).toFixed(2) : null, freeMiddleOffsetMedian: mids.length ? mids.sort((a, b) => a - b)[Math.floor(mids.length / 2)] : null,
    };
  });
  const decks = rows.filter((r) => r.deck).map((r) => ({ x: r.x, z: r.z, road: r.road, above: r.deckAbove, roadBridge: r.bridge }));
  let maxGrade = 0;
  for (let i = 1; i < rows.length; i++) { const dl = Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z); if (dl > 0.5) maxGrade = Math.max(maxGrade, Math.abs(rows[i].h - rows[i - 1].h) / dl); }
  return { streets, decks, maxGrade: +maxGrade.toFixed(3) };
}

const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'pipe' });
await new Promise<void>((res) => server.stdout.on('data', (b) => String(b).includes(String(PORT)) && res()));
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => (window as any).__k3d?.ready, null, { timeout: 120_000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__k3d.driving.placed, null, { timeout: 60_000 });
  const mode = await page.evaluate(() => (window as any).__k3d.v5?.mode);
  const loop = await sample(page, resample(BLOCK_LOOP, 2));
  const { pts } = chainOfWays(waysNamed('Jalan Tun Abang Haji Openg'), [-411, 2475]);
  const openg = await sample(page, resample(pts, 2));
  const report = { mode, blockLoop: summarise(loop), openg: summarise(openg), rows: { loop, openg } };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ mode, blockLoop: report.blockLoop, openg: report.openg }, null, 1));
} finally {
  await browser.close();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']); else server.kill();
}
