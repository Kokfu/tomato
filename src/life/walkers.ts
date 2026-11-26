// N1-M6 part B: people on the footpaths and five-foot ways of the whole city.
//
// Pure TypeScript (no three.js, no DOM). A walker exists only near the player. Each one is given a short route when it
// appears and walks it to and fro, pausing at the ends; some just stand. Routes come from the loaded chunk data:
//   - the footpath beside a mapped carriageway (N1-M4 lays it kerb + 1.6 m beside the larger roads; beside a small
//     street people walk on the verge behind the drain),
//   - a mapped pedestrian street, footway or path,
//   - the five-foot way behind a shophouse frontage (the edges the streetscape pass marked as street fronts).
// A route is kept only where a standing person is clear of walls, piers, parked cars and water, so nobody walks
// through a building. Who walks where is invented; nothing here is surveyed (docs/LIMITATIONS.md).
import { CHUNK_SIZE, QUANT } from '../world/config.ts';
import { ROAD_TYPES } from '../world/types.ts';
import type { ChunkData, RoadData } from '../world/types.ts';
import { ARCADE_DEPTH, edgeOutward } from '../world/arch/frontage.ts';

export interface WalkerHost {
  /** Loaded chunk data, or undefined. */
  chunk(cx: number, cz: number): ChunkData | undefined;
  /** Height of the walkable surface under feet at height y. */
  ground(x: number, z: number, y: number): number;
  /** True where a standing person is on loaded ground, outside every wall, pier, parked vehicle and the water. */
  clear(x: number, z: number, y: number): boolean;
}

export interface Walker {
  id: number;
  /** Route [x, z, ...], the distance of each point from the first, and its length. */
  pts: Float32Array;
  cum: Float32Array;
  len: number;
  s: number;
  dir: 1 | -1;
  /** Walking pace and speed now, m/s. */
  pace: number;
  v: number;
  wait: number;
  /** A standing figure (never walks). */
  stand: boolean;
  /** On a five-foot way. */
  arcade: boolean;
  x: number; y: number; z: number;
  /** The ground height last looked up (the walker eases to it). */
  gy: number;
  heading: number;
  /** Walk cycle, 0..1. */
  phase: number;
  /** Seed of the clothes, and body height in metres. */
  look: number;
  height: number;
  dead: boolean;
}

export interface WalkOptions {
  want: number;
  rMin: number; rMax: number; far: number;
}

/** Lateral position of a walker beside a road of this class, metres beyond the carriageway edge (null: nobody walks it). */
const BESIDE: Record<string, number | null> = {
  motorway: null, trunk: 0.95, primary: 0.95, secondary: 0.95, tertiary: 0.88, residential: 1.45, service: 0.5,
  stream: null, rail: null,
};
const STEP = 2, MIN_RUN = 9, MAX_RUN = 70, TURN = 4.5, ACCEL = 2.2, STRIDE = 1.45;
/** Points of one route that are tested against the collision world (the first 190 m of a long street). */
const MAX_SAMPLES = 96;

/** Per chunk: the roads and street fronts people may walk along, and the routes already worked out (null: none there). */
interface ChunkLists { roads: number[]; fronts: [number, number][]; runs: Map<number, Float32Array | null> }

/** Longest stretch of consecutive `true`, as [first, last] indices (or null). */
function longestRun(ok: boolean[]): [number, number] | null {
  let best: [number, number] | null = null, a = -1;
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) { if (a < 0) a = i; continue; }
    if (a >= 0 && (!best || i - 1 - a > best[1] - best[0])) best = [a, i - 1];
    a = -1;
  }
  return best;
}

export class Walkers {
  readonly host: WalkerHost;
  readonly list: Walker[] = [];
  private rand: () => number;
  private nextId = 1;
  /** Routes worked out so far (a counter: the dear step is rationed per frame). */
  built = 0;
  private frame = 0;
  private lists = new WeakMap<ChunkData, ChunkLists>();

  constructor(host: WalkerHost, rand: () => number) { this.host = host; this.rand = rand; }

  private listsOf(data: ChunkData): ChunkLists {
    let l = this.lists.get(data);
    if (!l) {
      l = { roads: [], fronts: [], runs: new Map() };
      data.roads.forEach((r, i) => { if (BESIDE[ROAD_TYPES[r.t]] !== null && !(r.f & 3) && r.p.length >= 4) l!.roads.push(i); });
      data.buildings.forEach((b, i) => { if (b.lm === undefined && b.a?.f.length) for (const e of b.a.f) l!.fronts.push([i, e]); });
      this.lists.set(data, l);
    }
    return l;
  }

  /** Resample a polyline every STEP metres and keep its longest clear stretch. */
  private clearRun(line: number[]): Float32Array | null {
    const pts: number[] = [];
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2], az = line[i - 1], dx = line[i] - ax, dz = line[i + 1] - az, l = Math.hypot(dx, dz), n = Math.max(1, Math.round(l / STEP));
      for (let k = i === 2 ? 0 : 1; k <= n; k++) pts.push(ax + (dx * k) / n, az + (dz * k) / n);
    }
    const n = Math.min(MAX_SAMPLES, pts.length / 2);
    if (n < 2) return null;
    const ok: boolean[] = [];
    for (let i = 0; i < n; i++) { const x = pts[i * 2], z = pts[i * 2 + 1]; ok.push(this.host.clear(x, z, this.host.ground(x, z, -1e6) + 0.6)); }
    const run = longestRun(ok);
    if (!run || (run[1] - run[0]) * STEP < MIN_RUN) return null;
    return Float32Array.from(pts.slice(run[0] * 2, run[1] * 2 + 2));
  }

  /**
   * A route of this chunk, worked out once and remembered with the chunk's data (testing a route against the collision
   * world is the dear part; a place with no room for a walker is not tried again every frame).
   */
  private run(lists: ChunkLists, key: number, make: () => Float32Array | null): Float32Array | null {
    let r = lists.runs.get(key);
    if (r === undefined) { r = make(); lists.runs.set(key, r); this.built++; }
    return r;
  }

  /** The footpath on one side of a road (or a line along a footway), world metres. `side` is 1 = left of the vertex order, -1 = right. */
  private roadRoute(data: ChunkData, r: RoadData, side: 1 | -1): Float32Array | null {
    const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, type = ROAD_TYPES[r.t], hw = r.w / QUANT / 2;
    const beside = BESIDE[type];
    const lat = side * (beside === undefined ? Math.max(0, hw - 0.6) * 0.7 : hw + (beside ?? 0));
    const p = r.p, n = p.length / 2, line: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
      // left of the vertex order is (dz, -dx)
      line.push(ox + p[i * 2] / QUANT + (dz / l) * lat, oz + p[i * 2 + 1] / QUANT - (dx / l) * lat);
    }
    return this.clearRun(line);
  }

  /** The middle of the five-foot way behind one street-front edge of a shophouse block. */
  private arcadeRoute(data: ChunkData, bi: number, edge: number): Float32Array | null {
    const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, r = data.buildings[bi].r[0], n = r.length / 2;
    if (edge < 0 || edge >= n) return null;
    const j = (edge + 1) % n, [nx, nz] = edgeOutward(r, edge);
    const ax = ox + r[edge * 2] / QUANT, az = oz + r[edge * 2 + 1] / QUANT, bx = ox + r[j * 2] / QUANT, bz = oz + r[j * 2 + 1] / QUANT;
    const l = Math.hypot(bx - ax, bz - az), d = ARCADE_DEPTH * 0.5;
    if (l < MIN_RUN + 2) return null;
    const ux = (bx - ax) / l, uz = (bz - az) / l;
    return this.clearRun([ax + ux - nx * d, az + uz - nz * d, bx - ux - nx * d, bz - uz - nz * d]);
  }

  /** Put one walker near the focus. Returns it, or null when no route was found this time. */
  spawn(fx: number, fz: number, o: WalkOptions, rMin = o.rMin): Walker | null {
    const a = this.rand() * Math.PI * 2, d = rMin + this.rand() * (o.rMax - rMin);
    const tx = fx + Math.cos(a) * d, tz = fz + Math.sin(a) * d;
    const data = this.host.chunk(Math.floor(tx / CHUNK_SIZE), Math.floor(tz / CHUNK_SIZE));
    if (!data) return null;
    const lists = this.listsOf(data);
    let pts: Float32Array | null = null, arcade = false;
    if (lists.fronts.length && this.rand() < 0.5) {
      const k = Math.floor(this.rand() * lists.fronts.length), [bi, e] = lists.fronts[k];
      pts = this.run(lists, -1 - k, () => this.arcadeRoute(data, bi, e)); arcade = true;
    } else if (lists.roads.length) {
      const i = lists.roads[Math.floor(this.rand() * lists.roads.length)], r = data.roads[i];
      // (on a one-way main road the other carriageway is on the right: the footpath is on the left)
      const side = r.f & 8 && r.t <= 4 ? 1 : this.rand() < 0.5 ? 1 : -1;
      pts = this.run(lists, i * 2 + (side > 0 ? 0 : 1), () => this.roadRoute(data, r, side));
    }
    if (!pts) return null;
    // a long route is walked in part: at most MAX_RUN metres of it
    const max = Math.floor(MAX_RUN / STEP);
    if (pts.length / 2 - 1 > max) { const a = Math.floor(this.rand() * (pts.length / 2 - 1 - max)); pts = pts.subarray(a * 2, (a + max) * 2 + 2); }
    const n = pts.length / 2, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const len = cum[n - 1];
    // start at the point of the route nearest the place asked for
    let k = 0, best = Infinity;
    for (let i = 0; i < n; i++) { const q = Math.hypot(pts[i * 2] - tx, pts[i * 2 + 1] - tz); if (q < best) { best = q; k = i; } }
    const x = pts[k * 2], z = pts[k * 2 + 1], df = Math.hypot(x - fx, z - fz);
    if (df < rMin || df > o.rMax) return null;
    if (this.list.some((w) => Math.abs(w.x - x) < 1.5 && Math.abs(w.z - z) < 1.5)) return null;
    // (nobody is left standing in the mouth of a side street: the traffic would wait for them for good)
    const stand = this.rand() < (arcade ? 0.3 : 0.14) && (arcade || !this.onCarriageway(data, x, z));
    const w: Walker = {
      id: this.nextId++, pts, cum, len, s: cum[k], dir: this.rand() < 0.5 ? 1 : -1, pace: 1.05 + this.rand() * 0.45, v: 0, wait: 0, stand, arcade,
      x, y: 0, gy: 0, z, heading: this.rand() * Math.PI * 2, phase: this.rand(), look: Math.floor(this.rand() * 0x7fffffff), height: 1.52 + this.rand() * 0.26, dead: false,
    };
    w.y = w.gy = this.host.ground(x, z, this.host.ground(x, z, -1e6) + 0.6);
    if (!stand) { this.at(w, w.s); w.heading = this.dirAt(w); w.v = w.pace; }
    this.list.push(w);
    return w;
  }

  /** True within a carriageway of this chunk (plus half a metre). */
  private onCarriageway(data: ChunkData, x: number, z: number): boolean {
    const lx = (x - data.cx * CHUNK_SIZE) * QUANT, lz = (z - data.cz * CHUNK_SIZE) * QUANT;
    for (const r of data.roads) {
      if (r.t > 6) continue; // motorway .. service
      const p = r.p, lim = r.w / 2 + 0.5 * QUANT;
      for (let i = 2; i < p.length; i += 2) {
        const ax = p[i - 2], az = p[i - 1], vx = p[i] - ax, vz = p[i + 1] - az, l2 = vx * vx + vz * vz;
        if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((lx - ax) * vx + (lz - az) * vz) / l2));
        if (Math.hypot(lx - ax - vx * t, lz - az - vz * t) < lim) return true;
      }
    }
    return false;
  }

  private seg(w: Walker, s: number): number {
    let i = 1;
    while (i < w.cum.length - 1 && w.cum[i] < s) i++;
    return i;
  }

  private at(w: Walker, s: number): void {
    const i = this.seg(w, s), l = w.cum[i] - w.cum[i - 1] || 1, t = (s - w.cum[i - 1]) / l, p = w.pts;
    w.x = p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * t; w.z = p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * t;
  }

  private dirAt(w: Walker): number {
    const i = this.seg(w, w.s), p = w.pts;
    return Math.atan2((p[i * 2] - p[i * 2 - 2]) * w.dir, (p[i * 2 + 1] - p[i * 2 - 1]) * w.dir);
  }

  /** Advance by dt seconds. (px, pz) is the player: a walker waits rather than walk into them. */
  update(dt: number, fx: number, fz: number, o: WalkOptions, px: number, pz: number, fresh = false): void {
    const h = this.host, list = this.list;
    this.frame++;
    for (const w of list) {
      // (whether it is still wanted, and the ground under a standing figure, are looked at every eighth frame, in turn)
      const turn = ((this.frame + w.id) & 7) === 0;
      if (turn && (Math.hypot(w.x - fx, w.z - fz) > o.far || !h.chunk(Math.floor(w.x / CHUNK_SIZE), Math.floor(w.z / CHUNK_SIZE)))) { w.dead = true; continue; }
      if (w.stand) { if (turn) w.y = w.gy = h.ground(w.x, w.z, w.y + 0.4); continue; }
      let want = w.pace;
      const end = w.dir > 0 ? w.len - w.s : w.s;
      if (w.wait > 0) { w.wait -= dt; want = 0; }
      else if (end < 0.05) {
        w.wait = this.rand() < 0.5 ? 2 + this.rand() * 5 : 0.4;
        w.dir = -w.dir as 1 | -1;
        want = 0;
      } else {
        want = Math.min(want, Math.sqrt(2 * ACCEL * end) + 0.05);
        const ox = px - w.x, oz = pz - w.z;
        if (ox * ox + oz * oz < 1.3 && ox * Math.sin(w.heading) + oz * Math.cos(w.heading) > 0) want = 0;
      }
      w.v += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, want - w.v));
      if (w.v > 0.02 && w.wait <= 0) {
        const step = Math.min(end, w.v * dt);
        w.s = Math.max(0, Math.min(w.len, w.s + step * w.dir));
        w.phase = (w.phase + step / STRIDE) % 1;
        this.at(w, w.s);
        const target = this.dirAt(w), dy = Math.atan2(Math.sin(target - w.heading), Math.cos(target - w.heading));
        w.heading += Math.max(-TURN * dt, Math.min(TURN * dt, dy));
      }
      // (the ground under a walker is looked up every fourth frame, in turn)
      if (((this.frame + w.id) & 3) === 0) w.gy = h.ground(w.x, w.z, w.y + 0.4);
      w.y += (w.gy - w.y) * Math.min(1, dt * 14);
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    // new walkers: several tries a frame, but at most one route worked out afresh (two while the streets are being
    // filled); the rest come from the chunk's memory
    const tries = fresh ? o.want * 6 : 3, limit = this.built + (fresh ? 2 : 1);
    for (let i = 0; i < tries && list.length < o.want && this.built < limit; i++) this.spawn(fx, fz, o, fresh ? Math.min(o.rMin, 6) : o.rMin);
  }

  /** A new budget: no more than `max` walkers. */
  trim(max: number): void { if (this.list.length > max) this.list.length = max; }

  clear(): void { this.list.length = 0; }
}
