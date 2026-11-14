import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const DATA = 'public/data/kuching';
export const manifest = JSON.parse(readFileSync(`${DATA}/manifest.json`, 'utf8'));
export const CHUNK = manifest.chunkSize as number;
export const Q = manifest.quant as number;

export interface Issues { errors: string[] }

/** Collect console errors, page errors and failed requests. */
export function watch(page: Page): Issues {
  const issues: Issues = { errors: [] };
  page.on('console', (m) => { if (m.type() === 'error') issues.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => issues.errors.push(`pageerror: ${e.message}`));
  // A single aborted chunk request is retried by the app; a chunk that stays missing is reported
  // by the app as a console error, which is collected above.
  page.on('requestfailed', (r) => { if (!r.url().includes('/chunks/')) issues.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  page.on('response', (r) => { if (r.status() >= 400) issues.errors.push(`http ${r.status()}: ${r.url()}`); });
  return issues;
}

export async function start(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => (window as any).__k3d?.ready === true, null, { timeout: 90_000 });
  await expect(page.locator('#btn-start')).toBeEnabled();
  await page.locator('#btn-start').click();
  await expect(page.locator('#start')).toBeHidden();
}

export async function waitChunks(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__k3d.world.chunks.progress() >= 0.999, null, { timeout: 90_000 });
}

export interface State { x: number; y: number; z: number; speed: number; grounded: boolean; onDeck: boolean; blocked: string; inWater: boolean; inBuilding: boolean; ground: number }
export function state(page: Page): Promise<State> {
  return page.evaluate(() => {
    const k = (window as any).__k3d, p = k.player.position, c = k.world.collision;
    return {
      x: p.x, y: p.y, z: p.z, speed: k.player.speed, grounded: k.player.grounded, onDeck: k.player.onDeck, blocked: k.player.blocked,
      inWater: c.inWater(p.x, p.z), inBuilding: c.insideBuilding(p.x, p.z, p.y), ground: c.groundAt(p.x, p.z, p.y).h,
    };
  });
}

export interface WalkResult { reached: boolean; x: number; y: number; z: number; maxY: number; frames: number; sawWater: boolean; sawLoading: boolean; sawEdge: boolean; everInBuilding: boolean; everInWaterOffDeck: boolean; overWaterOnDeck: number }

/**
 * Steer the real character controller toward successive waypoints using the normal input path
 * (camera yaw + forward intent), so collisions and walkability rules apply exactly as in play.
 */
export function walk(page: Page, points: [number, number][], opts: { run?: boolean; speedup?: number; tolerance?: number; maxSeconds?: number } = {}): Promise<WalkResult> {
  return page.evaluate(
    ({ points, opts }) =>
      new Promise<any>((resolve) => {
        const k = (window as any).__k3d;
        const tol = opts.tolerance ?? 1.2;
        const speedup = opts.speedup ?? 1;
        k.setStepsPerFrame(speedup);
        k.setSimulatedDt(1 / 60);
        const maxFrames = ((opts.maxSeconds ?? 120) * 60) / speedup;
        let i = 0, frames = 0, maxY = -1e9;
        const res = { sawWater: false, sawLoading: false, sawEdge: false, everInBuilding: false, everInWaterOffDeck: false, overWaterOnDeck: 0 };
        const finish = (reached: boolean) => {
          k.input.touchX = k.input.touchY = 0;
          k.input.touchRun = false;
          k.setStepsPerFrame(1);
          k.setSimulatedDt(0);
          const p = k.player.position;
          resolve({ reached, x: p.x, y: p.y, z: p.z, maxY, frames, ...res });
        };
        const tick = () => {
          const p = k.player.position, c = k.world.collision;
          maxY = Math.max(maxY, p.y);
          if (k.player.blocked === 'water') res.sawWater = true;
          if (k.player.blocked === 'loading') res.sawLoading = true;
          if (k.player.blocked === 'edge') res.sawEdge = true;
          if (c.insideBuilding(p.x, p.z, p.y)) res.everInBuilding = true;
          const wet = c.inWater(p.x, p.z);
          if (wet && k.player.grounded && !k.player.onDeck) res.everInWaterOffDeck = true;
          if (wet && k.player.onDeck) res.overWaterOnDeck++;
          while (i < points.length && Math.hypot(points[i][0] - p.x, points[i][1] - p.z) < tol) i++;
          if (i >= points.length) return finish(true);
          if (++frames > maxFrames) return finish(false);
          const dx = points[i][0] - p.x, dz = points[i][1] - p.z;
          k.tpc.yaw = Math.atan2(-dx, -dz);
          k.input.touchX = 0;
          k.input.touchY = 1;
          k.input.touchRun = !!opts.run;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { points, opts },
  );
}

export function teleport(page: Page, x: number, z: number): Promise<void> {
  return page.evaluate(([x, z]) => (window as any).__k3d.player.teleport(x, z), [x, z]);
}

function loadChunk(cx: number, cz: number): any | null {
  try { return JSON.parse(readFileSync(`${DATA}/chunks/${cx}_${cz}.json`, 'utf8')); } catch { return null; }
}

/** Ordered world-space polyline of a set of OSM ways, reassembled from the chunk files. */
export function chainOfWays(ids: number[], from: [number, number]): { pts: [number, number][]; elev: number[] } {
  const segs: { a: [number, number]; b: [number, number]; ea: number; eb: number }[] = [];
  for (const key of manifest.chunks as string[]) {
    const [cx, cz] = key.split('_').map(Number);
    const c = loadChunk(cx, cz);
    for (const r of c.roads) {
      if (!ids.includes(r.id)) continue;
      for (let i = 2; i < r.p.length; i += 2) {
        segs.push({
          a: [cx * CHUNK + r.p[i - 2] / Q, cz * CHUNK + r.p[i - 1] / Q], b: [cx * CHUNK + r.p[i] / Q, cz * CHUNK + r.p[i + 1] / Q],
          ea: r.e ? r.e[i / 2 - 1] / Q : 0, eb: r.e ? r.e[i / 2] / Q : 0,
        });
      }
    }
  }
  // Greedy chain starting from the segment end nearest to `from`.
  const pts: [number, number][] = [], elev: number[] = [];
  let cur = from;
  const near = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let first = true;
  while (segs.length) {
    let bi = -1, flip = false, bd = Infinity;
    segs.forEach((s, i) => {
      const da = near(s.a, cur), db = near(s.b, cur);
      if (da < bd) { bd = da; bi = i; flip = false; }
      if (db < bd) { bd = db; bi = i; flip = true; }
    });
    if (!first && bd > 0.05) break; // remaining segments are side branches
    const s = segs.splice(bi, 1)[0];
    const [p, q, ep, eq] = flip ? [s.b, s.a, s.eb, s.ea] : [s.a, s.b, s.ea, s.eb];
    if (first) { pts.push(p); elev.push(ep); first = false; }
    pts.push(q);
    elev.push(eq);
    cur = q;
  }
  return { pts, elev };
}

export const overview = () => JSON.parse(readFileSync(`${DATA}/overview.json`, 'utf8'));
export const landmarks = () => JSON.parse(readFileSync(`${DATA}/landmarks.json`, 'utf8')) as { id: string; name: string; x: number; z: number }[];
