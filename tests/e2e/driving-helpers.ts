// V8 driving: helpers shared by the driving spec and tools/dev/drive-shots.ts.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DATA, manifest } from './helpers.ts';

/** OSM way ids of every drivable piece carrying this street name. */
export function waysNamed(name: string): number[] {
  const ids = new Set<number>();
  for (const key of manifest.chunks as string[]) {
    const c = JSON.parse(readFileSync(`${DATA}/chunks/${key}.json`, 'utf8'));
    for (const r of c.roads) if (r.t <= 6 && r.n !== undefined && c.names[r.n] === name) ids.add(r.id);
  }
  return [...ids];
}

export const pathLength = (pts: [number, number][]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

export interface CarState { active: boolean; placed: boolean; x: number; y: number; z: number; heading: number; vf: number; vl: number; kmh: number; steer: number; onRoad: boolean; onDeck: boolean; road: string | null; blocked: string; pitch: number; roll: number; ground: number; inBuilding: boolean; inWater: boolean }
export function carState(page: Page): Promise<CarState> {
  return page.evaluate(() => {
    const k = (window as any).__k3d, d = k.driving, car = d.car, c = k.world.collision;
    const f = car.footprint(-0.05);
    let inBuilding = false, inWater = false;
    for (let i = 0; i < 8; i += 2) { if (c.insideBuilding(f[i], f[i + 1], car.y, false)) inBuilding = true; if (c.inWater(f[i], f[i + 1]) && !car.onDeck) inWater = true; }
    return {
      active: d.active, placed: d.placed, x: car.x, y: car.y, z: car.z, heading: car.heading, vf: car.vf, vl: car.vl, kmh: car.kmh, steer: car.steer,
      onRoad: car.onRoad, onDeck: car.onDeck, road: car.road?.name ?? null, blocked: car.blocked, pitch: car.pitch, roll: car.roll,
      ground: k.world.height.sample(car.x, car.z), inBuilding, inWater,
    };
  });
}

/** Stand the car at a pose, at rest. Test set-up only: play never teleports the car. */
export function placeCar(page: Page, x: number, z: number, heading: number): Promise<void> {
  return page.evaluate(([x, z, heading]) => {
    const d = (window as any).__k3d.driving;
    d.car.place(x, z, heading);
    d.car.lastRoad = null;
    d.position.set(d.car.x, d.car.y, d.car.z);
    d.model.sync(d.car, 0);
    d.camera.snap(d.car);
    if (!d.active) d.setParked(true);
  }, [x, z, heading]);
}

export interface DriveResult {
  reached: boolean; frames: number; seconds: number; distance: number; maxKmh: number; avgKmh: number;
  everInBuilding: boolean; everInWater: boolean; blocked: string[]; impacts: number; maxImpact: number; offRoadFrames: number;
  /** Largest gap between the car and the surface under its centre (metres), and the steepest attitude (rad). */
  maxHeightError: number; maxPitch: number; maxRoll: number;
  /** Frames on which the chunk under the car had no mesh yet; the most chunk meshes held; the slowest frame. */
  unbuiltFrames: number; maxChunks: number; maxFrameMs: number; roads: string[]; x: number; z: number;
  /** Times the driver had to reverse away from an obstacle. */
  recoveries: number;
  /** Where the first wall contacts happened: [x, z, closing speed]. */
  impactsAt: number[][];
  /** With `trace`: [x, z, speed, target index, target x, target z] every 12 frames. */
  trace: number[][];
}

/**
 * Drive the real car along a polyline through the normal input path (the steer / throttle intent that the
 * keyboard and the touch stick produce), so vehicle physics, collision and the road rules all apply.
 * Pure-pursuit steering; `speed` is the cruising speed in m/s. `realTime` leaves the game clock alone.
 */
export function driveRoute(page: Page, points: [number, number][], opts: { speed?: number; cornerSpeed?: number; speedup?: number; tolerance?: number; maxSeconds?: number; realTime?: boolean; trace?: boolean } = {}): Promise<DriveResult> {
  return page.evaluate(
    ({ points, opts }) =>
      new Promise<any>((resolve) => {
        const k = (window as any).__k3d, d = k.driving, car = d.car, c = k.world.collision, chunks = k.world.chunks;
        const cruise = opts.speed ?? 8, tol = opts.tolerance ?? 4, speedup = opts.speedup ?? 1;
        if (!opts.realTime) { k.setStepsPerFrame(speedup); k.setSimulatedDt(1 / 60); }
        const maxFrames = ((opts.maxSeconds ?? 180) * 60) / speedup;
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
        // Resample the way centre lines every 3 m (original vertices kept).
        // The route starts where the car stands (it may be parked beside the first way's centre line).
        const raw: [number, number][] = [[car.x, car.z], ...points];
        points = [raw[0]];
        for (let j = 1; j < raw.length; j++) {
          const a = raw[j - 1], b = raw[j], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
          for (let q = 1; q <= n; q++) points.push([a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n]);
        }
        // A driver keeps between the walls, not on the surveyor's line: where the mapped centre line runs close
        // to a building or a parked car, the target point moves to the middle of the space that is really free.
        // (Mapped carriageway widths are inferred; in places the line hugs one frontage.)
        const relaxed = new Uint8Array(points.length);
        const relax = (j: number) => {
          if (j <= 0 || j >= points.length || relaxed[j]) return;
          const p = points[j], a = points[j - 1], b = points[Math.min(points.length - 1, j + 1)];
          if (!c.isLoaded(p[0], p[1])) return;
          relaxed[j] = 1;
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, fx = (b[0] - a[0]) / l, fz = (b[1] - a[1]) / l, y = c.groundAt(p[0], p[1], 1e6).h;
          // A car-sized box with 0.75 m to spare on each side, slid sideways (left is (fz, -fx)) until it is clear;
          // where nothing that wide fits (the lane between two rows of parked cars), 0.4 m to spare and a crawl.
          // The path may not jump sideways: each point is searched within 1 m of the offset its predecessor took
          // (otherwise the nearest clear spot can be on the far side of a row of parked cars).
          const prev = offset[j - 1];
          // Rule-placed parked vehicles (Play.ts) drop their CollisionWorld walls while driving, so test their boxes too.
          const hitParked = (qx: number, qz: number, half: number) => {
            const list = k.play?.parked as any[] | undefined;
            if (!list?.length) return false;
            for (const pv of list) {
              const dx = qx - pv.x, dz = qz - pv.z;
              if (Math.abs(dx) > 6 || Math.abs(dz) > 6 || Math.abs((pv.y ?? y) - y) > 2.5) continue;
              const sh = Math.sin(pv.heading), ch = Math.cos(pv.heading);
              if (Math.abs(dx * sh + dz * ch) < 2.4 + 2.35 && Math.abs(dx * ch - dz * sh) < half + 0.98) return true;
            }
            return false;
          };
          for (const half of [1.62, 1.27, 1.02]) {
            const free = (n: number) => { const qx = p[0] + fz * n * 0.25, qz = p[1] - fx * n * 0.25; return !c.insideBuilding(qx, qz, y + 0.3) && !c.groundAt(qx, qz, y + 0.5).deck && !c.boxContact(qx, qz, fx, fz, 2.4, half, y) && !hitParked(qx, qz, half); };
            // Nearest clear offset to the line, then the middle of the clear band around it (capped: a wide road is not re-centred).
            let n0: number | null = null;
            for (let n = 0; n <= 40 && n0 === null; n++) { const q = (n % 2 ? -1 : 1) * Math.ceil(n / 2); if (Math.abs(q - prev) <= 4 && free(q)) n0 = q; }
            if (n0 === null) continue;
            let lo = n0, hi = n0;
            while (lo > n0 - 8 && lo - 1 >= prev - 4 && free(lo - 1)) lo--;
            while (hi < n0 + 8 && hi + 1 <= prev + 4 && free(hi + 1)) hi++;
            const mid = n0 === 0 && lo < 0 && hi > 0 ? 0 : (lo + hi) / 2;
            points[j] = [p[0] + fz * mid * 0.25, p[1] - fx * mid * 0.25];
            offset[j] = mid;
            if (half < 1.5) tight[j] = 1;
            return;
          }
          offset[j] = prev;
          points[j] = [p[0] + fz * prev * 0.25, p[1] - fx * prev * 0.25];
        };
        /** Sideways offset taken at each point, in quarter metres toward the left of travel. */
        const offset = new Float32Array(points.length);
        const tight = new Uint8Array(points.length);
        let relaxedTo = 1;
        const last = points[points.length - 1];
        let i = 1, frames = 0, dist = 0, px = car.x, pz = car.z, sumV = 0, tPrev = performance.now(), stopping = false, stuck = 0, backing = 0;
        // Turn angle at each route vertex: the driver brakes for the sharp ones (junction turns).
        const turn = points.map((p, j) => {
          if (j === 0 || j === points.length - 1) return 0;
          const a = points[j - 1], b = points[j + 1];
          return Math.abs(wrap(Math.atan2(b[0] - p[0], b[1] - p[1]) - Math.atan2(p[0] - a[0], p[1] - a[1])));
        });
        const cornerSpeed = opts.cornerSpeed ?? 3.6;
        const t0 = performance.now();
        const res = { everInBuilding: false, everInWater: false, blocked: [] as string[], impacts: 0, maxImpact: 0, offRoadFrames: 0, maxHeightError: 0, maxPitch: 0, maxRoll: 0, unbuiltFrames: 0, maxChunks: 0, maxFrameMs: 0, maxKmh: 0, recoveries: 0, impactsAt: [] as number[][], trace: [] as number[][] };
        const roads = new Set<string>();
        const finish = (reached: boolean) => {
          k.input.touchX = k.input.touchY = 0;
          k.setStepsPerFrame(1);
          k.setSimulatedDt(0);
          resolve({ reached, frames, seconds: (performance.now() - t0) / 1000, distance: dist, avgKmh: (sumV / Math.max(1, frames)) * 3.6, roads: [...roads], x: car.x, z: car.z, ...res });
        };
        const tick = () => {
          const now = performance.now();
          if (frames > 5) res.maxFrameMs = Math.max(res.maxFrameMs, now - tPrev);
          tPrev = now;
          dist += Math.hypot(car.x - px, car.z - pz); px = car.x; pz = car.z;
          sumV += Math.abs(car.vf);
          res.maxKmh = Math.max(res.maxKmh, car.kmh);
          const f = car.footprint(-0.05);
          for (let j = 0; j < 8; j += 2) {
            if (c.insideBuilding(f[j], f[j + 1], car.y, false)) res.everInBuilding = true;
            if (c.inWater(f[j], f[j + 1]) && !car.onDeck) res.everInWater = true;
          }
          if (car.blocked && !res.blocked.includes(car.blocked)) res.blocked.push(car.blocked);
          if (car.impact > 0.5) { res.impacts++; res.maxImpact = Math.max(res.maxImpact, car.impact); if (res.impactsAt.length < 12) res.impactsAt.push([+car.x.toFixed(1), +car.z.toFixed(1), +car.impact.toFixed(1)]); }
          if (!car.onRoad && !car.onDeck) res.offRoadFrames++;
          if (car.road?.name) roads.add(car.road.name);
          res.maxHeightError = Math.max(res.maxHeightError, Math.abs(car.y - c.groundAt(car.x, car.z, car.y).h));
          res.maxPitch = Math.max(res.maxPitch, Math.abs(car.pitch));
          res.maxRoll = Math.max(res.maxRoll, Math.abs(car.roll));
          if (!chunks.isReady(car.x, car.z)) res.unbuiltFrames++;
          res.maxChunks = Math.max(res.maxChunks, chunks.loadedCount);

          const toEnd = Math.hypot(last[0] - car.x, last[1] - car.z);
          if (stopping || (i >= points.length - 1 && toEnd < tol)) {
            // Brake to a halt at the end of the route.
            stopping = true;
            k.input.touchX = 0;
            k.input.touchY = car.vf > 0.6 ? -1 : 0;
            if (Math.abs(car.vf) < 0.05) return finish(true);
            if (++frames > maxFrames) return finish(false);
            return void requestAnimationFrame(tick);
          }
          if (++frames > maxFrames) return finish(false);
          if (opts.trace && frames % 12 === 0 && res.trace.length < 400) res.trace.push([+car.x.toFixed(1), +car.z.toFixed(1), +car.vf.toFixed(1), i, +points[i][0].toFixed(1), +points[i][1].toFixed(1)]);
          const look = 4.5 + Math.abs(car.vf) * 0.55;
          for (; relaxedTo < Math.min(points.length, i + 8); relaxedTo++) relax(relaxedTo);
          while (i < points.length - 1 && Math.hypot(points[i][0] - car.x, points[i][1] - car.z) < look) i++;
          const err = wrap(Math.atan2(points[i][0] - car.x, points[i][1] - car.z) - car.heading);
          // Heading increases toward the left; the steer intent is positive toward the right.
          const steer = Math.max(-1, Math.min(1, -err * 1.8));
          let target = cruise * (1 - 0.65 * Math.min(1, Math.abs(err) / 0.5));
          // Brake in time for the sharp bends ahead (and just behind: the turn is still being made), as a driver would.
          for (let j = Math.max(1, i - 3); j < Math.min(points.length - 1, i + 12); j++) {
            if (turn[j] < 0.3) continue;
            const dj = Math.max(0, Math.hypot(points[j][0] - car.x, points[j][1] - car.z) - 5);
            const vc = cornerSpeed + (cruise - cornerSpeed) * Math.max(0, 1 - turn[j] / 1.2);
            target = Math.min(target, Math.sqrt(vc * vc + 2 * 2.5 * dj));
          }
          for (let j = Math.max(0, i - 4); j < Math.min(points.length, i + 5); j++) if (tight[j]) { target = Math.min(target, 3.2); break; }
          if (i >= points.length - 1) target = Math.min(target, Math.max(2, toEnd * 0.5));
          // N2-M0a: with ambient traffic on, follow behind queued vehicles in our lane and ease left past oncoming traffic
          // instead of ramming them off the route or triggering blind reverse recovery.
          let waitingTraffic = false, dodgeSteer = 0;
          const traffic = k.life?.active ? (k.life.traffic?.vehicles as any[] | undefined) : undefined;
          if (traffic?.length) {
            const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
            for (const v of traffic) {
              const dx = v.x - car.x, dz = v.z - car.z;
              if (Math.abs(dx) > 22 || Math.abs(dz) > 22 || Math.abs(v.y - car.y) > 2.5) continue;
              const fwd = dx * hx + dz * hz;
              if (fwd < 1.2 || fwd > 20) continue;
              const lat = dx * hz - dz * hx; // > 0 means vehicle is to our left
              const align = Math.cos(v.heading - car.heading);
              if (align > 0.35 && Math.abs(lat) < 2.2) {
                const safe = Math.max(0, v.v + (fwd - 6.8) * 0.65);
                if (safe < target) { target = safe; if (fwd < 9 && v.v < 1.5) waitingTraffic = true; }
              } else if (align < -0.45 && Math.abs(lat) < 2.5 && fwd < 18) {
                target = Math.min(target, 4.2);
                dodgeSteer = -0.28; // steer slightly toward the left kerb (heading+, steerOut-)
              }
            }
          }
          let throttle = Math.max(-1, Math.min(1, (target - car.vf) * 0.7));
          let steerOut = Math.max(-1, Math.min(1, steer + dodgeSteer));
          // Stuck against something: back off with opposite lock for a moment, then try again.
          stuck = !waitingTraffic && Math.abs(car.vf) < 0.3 && throttle > 0.2 ? stuck + 1 : 0;
          if (stuck > 90) { backing = 100; stuck = 0; res.recoveries++; }
          if (backing > 0) { backing--; throttle = -0.7; steerOut = -steer; }
          k.input.touchX = steerOut;
          // Exactly zero on both axes would hand the stick back to the keyboard.
          k.input.touchY = Math.abs(throttle) < 1e-3 ? 1e-3 : throttle;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { points, opts },
  );
}
