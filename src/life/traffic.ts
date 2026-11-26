// N1-M6 part B: ambient traffic on the mapped carriageways (drive-graph.json).
//
// Pure TypeScript (no three.js, no DOM): the game and the Node unit tests run this same code. Vehicles exist only in a
// ring round the player. Each follows the centre line of a mapped carriageway, offset to the LEFT of its direction
// of travel (Malaysia drives on the left), never enters a one-way street against its direction, stops at mapped
// traffic signals and gives way at junctions, and brakes for whatever stands in its path: another vehicle, a walker
// or the player.
//
// Everything about the traffic itself is invented (docs/LIMITATIONS.md): which vehicles, how many, their speeds, the
// signal timing and the priority rules (the larger road class goes first). Only the roads, their one-way flags and
// the signal positions are mapped.
import { EDGE_BRIDGE, EDGE_TUNNEL } from '../ui/Router.ts';
import type { RouteGraph } from '../ui/Router.ts';

/** Vehicle kinds: three cars of the parked-car kit and the kapcai (underbone motorbike) with its rider. */
export const KIND = { hatch: 0, saloon: 1, suv: 2, kapcai: 3 } as const;
/** Half length and half width by kind, metres. */
export const SIZE: readonly { half: number; hw: number }[] = [{ half: 1.95, hw: 0.87 }, { half: 2.2, hw: 0.86 }, { half: 2.15, hw: 0.91 }, { half: 0.95, hw: 0.36 }];

export interface TrafficHost {
  /** Height of the surface under a vehicle whose wheels are at height y (bridge decks included). */
  ground(x: number, z: number, y: number): number;
  /** True where the ground and collision round (x, z) are loaded. */
  loaded(x: number, z: number): boolean;
  /** Mapped carriageway width at this point, or null when it is not known (yet). */
  width(x: number, z: number): number | null;
  /** A mapped traffic signal stands at this junction; null = its data is not loaded yet. */
  signal(x: number, z: number): boolean | null;
  /** Streets kept free of ambient traffic, by name (optional). */
  closed?(name: string | undefined): boolean;
}

/** Something a vehicle must not drive into: a walker or the player (on foot or in the car). */
export interface Obstacle { x: number; z: number; r: number; vx: number; vz: number }

/** One stretch of a trip: an edge of the graph, travelled a -> b (`fwd`) or b -> a, `off` metres left of its centre line. */
interface Leg { e: number; fwd: boolean; off: number; len: number }

export interface Vehicle {
  id: number;
  kind: number;
  /** Index into the paint list of the renderer. */
  tint: number;
  prev: Leg | null;
  cur: Leg;
  next: Leg | null;
  /** Metres travelled along `cur`. */
  s: number;
  /** Speed, m/s, and this driver's share of the road's speed. */
  v: number;
  pace: number;
  x: number; y: number; z: number;
  /** Direction of travel as an angle about +Y: the vehicle faces (sin, cos). */
  heading: number;
  pitch: number;
  /** The ground height and slope last looked up (the body eases to them). */
  gy: number;
  gp: number;
  braking: boolean;
  /** The speed limit it last worked out, and the seconds since (it looks at the road ten times a second). */
  cap: number;
  since: number;
  /** Why it is not at its free speed (for tests and the debug hook). */
  why: '' | 'follow' | 'signal' | 'yield' | 'turn';
  /** Seconds standing behind a vehicle that is itself blocked; seconds left of ignoring vehicles after such a deadlock. */
  stuck: number;
  ghost: number;
  /** The vehicle it brakes for (0 = none), and seconds spent waiting to be let into a junction. */
  blocker: number;
  waited: number;
  /** Seconds standing behind something that is not a vehicle; seconds left of edging past it after a long wait. */
  held: number;
  past: number;
  /** The junction it has been let into, until it is 6 m beyond it. */
  holds: number;
  dead: boolean;
}

const SPEED: Record<string, number> = { motorway: 13, trunk: 12.5, primary: 12, secondary: 11, tertiary: 10, residential: 7.5 };
const DEFAULT_WIDTH: Record<string, number> = { motorway: 11, trunk: 10, primary: 9, secondary: 8, tertiary: 7, residential: 6 };
/** Comfortable braking, braking behind a leader, hardest braking, acceleration (m/s2). */
const B_EASY = 2.6, B_FOLLOW = 3.5, B_MAX = 7, ACCEL = 1.8;
/** Signal cycle, seconds: each of the two directions has 15 s green and 2 s amber, with 1 s of red for all between. */
export const SIGNAL = { cycle: 36, green: 15, amber: 2 };
/** Radius of the curve driven through a junction, metres. */
const CORNER = 6;
const SAMPLE = [0.8, 2.5, 4.5, 7, 10, 14, 19, 25];
/** Seconds between two looks at the road by one driver (speed and position are advanced every frame). */
const THINK = 0.1;

/** Small seeded generator (mulberry32): the same traffic for the same seed and steps. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Holder { id: number; from: number; to: number; t: number }
const P = { x: 0, z: 0, tx: 0, tz: 1 }, Q0 = { x: 0, z: 0, tx: 0, tz: 1 }, Q2 = { x: 0, z: 0, tx: 0, tz: 1 };
type Pt = typeof P;

export interface FillOptions {
  /** Vehicles wanted round the focus. */
  want: number;
  /** New vehicles appear between these distances from the focus; they are removed beyond `far`. */
  rMin: number; rMax: number; far: number;
  /** Relative share of each kind (KIND order). */
  kinds: readonly number[];
  /** Number of paints to choose from. */
  tints: number;
}

export class Traffic {
  readonly g: RouteGraph;
  readonly host: TrafficHost;
  readonly vehicles: Vehicle[] = [];
  /** 1 where ambient traffic may drive: a public carriageway (not a service road, not a covered way) that leads on. */
  readonly ok: Uint8Array;
  /** Per direction of each edge (edge * 2 for a -> b, + 1 for b -> a): 1 where a vehicle may travel that way. */
  readonly good: Uint8Array;
  private nOk: Uint8Array;
  private nRef: Int32Array;
  private nBest: Uint8Array;
  private nBestEdge: Int32Array;
  private nSecond: Uint8Array;
  time = 0;
  /** Tilt each vehicle to the slope under it (two more ground samples per vehicle per frame; off on the Low preset). */
  pitch = true;
  private step = 0;
  private swept = 0;
  private frame = 0;
  private rand: () => number;
  private nextId = 1;
  private cums: (Float32Array | undefined)[] = [];
  private widths = new Map<number, number>();
  private signals = new Map<number, boolean>();
  private holders = new Map<number, Holder[]>();
  private mx: Float32Array;
  private mz: Float32Array;
  private pool: number[] = [];
  private poolAt: [number, number, number] = [Infinity, Infinity, 0];
  private bends: (number[] | undefined)[] = [];
  private fx = new Float64Array(SAMPLE.length + 1);
  private fz = new Float64Array(SAMPLE.length + 1);
  private fd = new Float64Array(SAMPLE.length + 1);

  constructor(g: RouteGraph, host: TrafficHost, seed = 20261126) {
    this.g = g; this.host = host; this.rand = rng(seed);
    const E = g.edgeCount, ok = (this.ok = new Uint8Array(E));
    const deg = new Int32Array(g.nodeCount);
    for (let e = 0; e < E; e++) {
      if (SPEED[g.typeOf(e)] === undefined || (g.eflags[e] & EDGE_TUNNEL) !== 0 || host.closed?.(g.nameOf(e))) continue;
      ok[e] = 1; deg[g.ea[e]]++; deg[g.eb[e]]++;
    }
    // Streets that only lead to a dead end are left to the player: a vehicle would have to turn round in them.
    const queue: number[] = [];
    for (let n = 0; n < g.nodeCount; n++) if (deg[n] === 1) queue.push(n);
    while (queue.length) {
      const n = queue.pop()!;
      if (deg[n] !== 1) continue;
      for (const e of g.edgesAt(n)) {
        if (!ok[e]) continue;
        ok[e] = 0; deg[n]--;
        const o = g.ea[e] === n ? g.eb[e] : g.ea[e];
        if (--deg[o] === 1) queue.push(o);
      }
    }
    // The same for one-way streets: a direction of travel is used only if some other street can be entered at its end.
    const good = (this.good = new Uint8Array(E * 2));
    for (let e = 0; e < E; e++) if (ok[e]) { good[e * 2] = 1; if (!g.isOneWay(e)) good[e * 2 + 1] = 1; }
    for (let changed = true; changed; ) {
      changed = false;
      for (let arc = 0; arc < E * 2; arc++) {
        if (!good[arc]) continue;
        const e = arc >> 1, n = arc & 1 ? g.ea[e] : g.eb[e];
        let on = false;
        for (const o of g.edgesAt(n)) if (o !== e && good[o * 2 + (g.ea[o] === n ? 0 : 1)]) { on = true; break; }
        if (!on) { good[arc] = 0; changed = true; }
      }
    }
    for (let e = 0; e < E; e++) ok[e] = good[e * 2] | good[e * 2 + 1];
    // per junction: how many streets with traffic meet there, the first of them (the reference direction of a signal),
    // and the two largest road classes among them (the smaller the index, the larger the road)
    const N = g.nodeCount;
    this.nOk = new Uint8Array(N); this.nRef = new Int32Array(N).fill(-1);
    this.nBest = new Uint8Array(N).fill(99); this.nBestEdge = new Int32Array(N).fill(-1); this.nSecond = new Uint8Array(N).fill(99);
    for (let n = 0; n < N; n++) for (const e of g.edgesAt(n)) {
      if (!ok[e]) continue;
      this.nOk[n]++;
      if (this.nRef[n] < 0) this.nRef[n] = e;
      const r = g.etype[e];
      if (r < this.nBest[n]) { this.nSecond[n] = this.nBest[n]; this.nBest[n] = r; this.nBestEdge[n] = e; } else if (r < this.nSecond[n]) this.nSecond[n] = r;
    }
    this.mx = new Float32Array(E); this.mz = new Float32Array(E);
    for (let e = 0; e < E; e++) { if (!ok[e]) continue; this.along(e, true, g.elen[e] / 2, P); this.mx[e] = P.x; this.mz[e] = P.z; }
  }

  // ---- geometry ---------------------------------------------------------------------------------------------

  private cum(e: number): Float32Array {
    let c = this.cums[e];
    if (!c) {
      const p = this.g.epts[e];
      c = new Float32Array(p.length / 2);
      for (let i = 2; i < p.length; i += 2) c[i / 2] = c[i / 2 - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      this.cums[e] = c;
    }
    return c;
  }

  /** Point and unit direction of travel `s` metres along an edge (beyond its ends: straight on). */
  private along(e: number, fwd: boolean, s: number, out: Pt): void {
    const p = this.g.epts[e], c = this.cum(e), n = c.length, len = c[n - 1];
    const sa = fwd ? s : len - s;
    let i = 1;
    while (i < n - 1 && c[i] < sa) i++;
    const l = c[i] - c[i - 1] || 1, t = (sa - c[i - 1]) / l;
    const ax = p[i * 2 - 2], az = p[i * 2 - 1], dx = (p[i * 2] - ax) / l, dz = (p[i * 2 + 1] - az) / l;
    out.x = ax + dx * l * t; out.z = az + dz * l * t;
    out.tx = fwd ? dx : -dx; out.tz = fwd ? dz : -dz;
  }

  /** The same, on the lane: `off` metres to the left of the direction of travel. */
  private lane(leg: Leg, s: number, out: Pt): void {
    this.along(leg.e, leg.fwd, s, out);
    out.x += out.tz * leg.off; out.z -= out.tx * leg.off;
  }

  private corner(a: Leg, b: Leg): number { return Math.min(CORNER, 0.45 * a.len, 0.45 * b.len); }

  /** Point `u` metres past the junction between two legs (negative: before it), rounding the corner between the lanes. */
  private pair(a: Leg, b: Leg, u: number, out: Pt): void {
    const R = this.corner(a, b);
    if (u <= -R) return this.lane(a, a.len + u, out);
    if (u >= R) return this.lane(b, u, out);
    this.lane(a, a.len - R, Q0); this.lane(b, R, Q2);
    const cross = Q0.tx * Q2.tz - Q0.tz * Q2.tx;
    let cx = (Q0.x + Q2.x) / 2, cz = (Q0.z + Q2.z) / 2;
    if (Math.abs(cross) > 0.2) {
      const k = Math.max(0, Math.min(2.5 * R, ((Q2.x - Q0.x) * Q2.tz - (Q2.z - Q0.z) * Q2.tx) / cross));
      cx = Q0.x + Q0.tx * k; cz = Q0.z + Q0.tz * k;
    }
    const t = (u + R) / (2 * R), m = 1 - t;
    out.x = m * m * Q0.x + 2 * m * t * cx + t * t * Q2.x;
    out.z = m * m * Q0.z + 2 * m * t * cz + t * t * Q2.z;
    let tx = m * (cx - Q0.x) + t * (Q2.x - cx), tz = m * (cz - Q0.z) + t * (Q2.z - cz);
    const l = Math.hypot(tx, tz);
    if (l < 1e-6) { tx = Q2.tx; tz = Q2.tz; } else { tx /= l; tz /= l; }
    out.tx = tx; out.tz = tz;
  }

  /** Where a vehicle is (or will be) `ds` metres further along its path. */
  pathPoint(v: Vehicle, ds: number, out: Pt): void {
    const s = v.s + ds, c = v.cur;
    if (v.next && c.len - s < this.corner(c, v.next)) return this.pair(c, v.next, s - c.len, out);
    if (v.prev && s < this.corner(v.prev, c)) return this.pair(v.prev, c, s, out);
    this.lane(c, s, out);
  }

  // ---- the road -----------------------------------------------------------------------------------------------

  private width(e: number): number {
    let w = this.widths.get(e);
    if (w === undefined) {
      const m = this.host.width(this.mx[e], this.mz[e]);
      w = m ?? DEFAULT_WIDTH[this.g.typeOf(e)] ?? 6;
      if (m !== null) this.widths.set(e, w);
    }
    return w;
  }

  /** How far left of the centre line this kind keeps on an edge. */
  laneOffset(e: number, kind: number): number {
    const w = this.width(e), bike = kind === KIND.kapcai;
    if (this.g.isOneWay(e)) return w >= 7.5 ? w / 4 + (bike ? 0.7 : 0) : bike ? Math.max(0, Math.min(0.8, w / 2 - 0.9)) : 0;
    const off = Math.min(2.3, Math.max(w / 4, Math.min(1.15, w / 2 - 0.95)));
    return bike ? off + Math.max(0, Math.min(0.7, w / 2 - off - 0.6)) : off;
  }

  private leg(e: number, fwd: boolean, kind: number): Leg { return { e, fwd, off: this.laneOffset(e, kind), len: this.g.elen[e] }; }
  private endNode(l: Leg): number { return l.fwd ? this.g.eb[l.e] : this.g.ea[l.e]; }

  /** May a vehicle at node `n` enter edge `e`? */
  private enterable(e: number, n: number): boolean { return this.good[e * 2 + (this.g.ea[e] === n ? 0 : 1)] === 1; }

  /** Pick the next edge at the end of a leg: mostly straight on and onto the larger road, never back the way it came. */
  private choose(l: Leg, kind: number): Leg | null {
    const g = this.g, n = this.endNode(l);
    this.along(l.e, l.fwd, l.len, P);
    const tx = P.tx, tz = P.tz;
    let total = 0;
    const opts: [number, boolean, number][] = [];
    for (const e of g.edgesAt(n)) {
      if (e === l.e || !this.enterable(e, n)) continue;
      const fwd = g.ea[e] === n;
      this.along(e, fwd, 0, P);
      const straight = (1 + tx * P.tx + tz * P.tz) / 2;
      const w = (SPEED[g.typeOf(e)] - 4) * (0.2 + 0.8 * straight * straight);
      opts.push([e, fwd, w]); total += w;
    }
    if (!opts.length) return null;
    let r = this.rand() * total;
    for (const [e, fwd, w] of opts) { if ((r -= w) <= 0) return this.leg(e, fwd, kind); }
    const o = opts[opts.length - 1];
    return this.leg(o[0], o[1], kind);
  }

  private isSignal(n: number): boolean {
    let s = this.signals.get(n);
    if (s === undefined) {
      const m = this.host.signal(this.g.nx[n], this.g.nz[n]);
      if (m === null) return false;
      this.signals.set(n, (s = m));
    }
    return s;
  }

  /** 'green' | 'amber' | 'red' for traffic arriving at signal node `n` along edge `e`. */
  signalState(n: number, e: number): 'green' | 'amber' | 'red' {
    const g = this.g, ref = this.nRef[n];
    const dir = (edge: number): number => { this.along(edge, g.ea[edge] === n, 0, P); return Math.atan2(P.tx, P.tz); };
    let d = Math.abs(dir(e) - dir(ref)) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    const group = d < Math.PI / 4 ? 0 : 1;
    const t = (((this.time + n * 7.3 - group * (SIGNAL.cycle / 2)) % SIGNAL.cycle) + SIGNAL.cycle) % SIGNAL.cycle;
    this.redFor = Math.max(0, t - SIGNAL.green - SIGNAL.amber);
    return t < SIGNAL.green ? 'green' : t < SIGNAL.green + SIGNAL.amber ? 'amber' : 'red';
  }
  /** Seconds the signal last asked about (signalState) has been red; 0 while it is green or amber. */
  redFor = 0;


  /** Sharp bends of an edge's own shape: [metres from node a, ...]. */
  private bendsOf(e: number): number[] {
    let b = this.bends[e];
    if (!b) {
      b = [];
      const p = this.g.epts[e], c = this.cum(e);
      for (let i = 1; i < c.length - 1; i++) {
        const ax = p[i * 2] - p[i * 2 - 2], az = p[i * 2 + 1] - p[i * 2 - 1], bx = p[i * 2 + 2] - p[i * 2], bz = p[i * 2 + 3] - p[i * 2 + 1];
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
        if (la > 0.5 && lb > 0.5 && (ax * bx + az * bz) / (la * lb) < 0.86) b.push(c[i]);
      }
      this.bends[e] = b;
    }
    return b;
  }

  // ---- the vehicles -------------------------------------------------------------------------------------------

  private conflict(a: Holder, from: number, to: number): boolean {
    if (a.from === from) return false; // the same approach: one behind the other
    return !(a.to === from && a.from === to); // straight through against each other does not cross
  }

  /** Speed limit set by the junction ahead, and why. */
  private junction(v: Vehicle, limit: number): number {
    const c = v.cur, d = c.len - v.s, n = this.endNode(c);
    v.why = '';
    if (d > 70) return limit;
    let cap = limit;
    // the corner itself
    if (v.next) {
      this.along(c.e, c.fwd, c.len, P);
      const tx = P.tx, tz = P.tz;
      this.along(v.next.e, v.next.fwd, 0, P);
      const cos = tx * P.tx + tz * P.tz;
      if (cos < 0.9) {
        const turn = cos < 0.5 ? 4.2 : 6.5, k = Math.sqrt(turn * turn + 2 * B_EASY * Math.max(0, d - 6));
        if (k < cap) { cap = k; v.why = 'turn'; }
      }
    } else {
      const k = Math.sqrt(2 * B_EASY * Math.max(0, d - 4));
      if (k < cap) { cap = k; v.why = 'turn'; }
    }
    // The signal at the end of a short next street: there is no room to stop for it once on that street.
    if (v.next && v.next.len < 45) {
      const nl = v.next, n2 = this.endNode(nl);
      if (this.nOk[n2] >= 3 && this.isSignal(n2)) {
        const room2 = d + nl.len - Math.min(7, nl.len * 0.4), st = this.signalState(n2, nl.e);
        if (st === 'red' || (st === 'amber' && room2 > (v.v * v.v) / (2 * 3.2))) {
          const k = room2 <= 0.3 ? 0 : Math.sqrt(2 * B_EASY * (room2 - 0.3));
          if (k < cap) { cap = k; v.why = 'signal'; }
        }
      }
    }
    if (this.nOk[n] < 3) return cap;
    const line = Math.min(7, c.len * 0.4), room = d - line;
    if (room < -0.6 || v.holds === n) return cap; // already in the junction: clear it
    let stop: '' | 'signal' | 'yield' = '';
    const to = v.next ? v.next.e : -1;
    if (this.isSignal(n)) {
      const st = this.signalState(n, c.e);
      if (st === 'red' || (st === 'amber' && room > (v.v * v.v) / (2 * 3.2))) stop = 'signal';
    } else {
      const g = this.g, rank = g.etype[c.e];
      const best = this.nBestEdge[n] === c.e ? this.nSecond[n] : this.nBest[n];
      const held = this.holders.get(n);
      // (a driver who has waited long takes a smaller gap, and after 20 s edges out: the others brake for it)
      const patience = v.waited > 20 ? 0 : v.waited > 8 ? 0.4 : 1;
      if (held) for (const h of held) if (h.id !== v.id && this.time - h.t < 12 * patience && this.conflict(h, c.e, to)) stop = 'yield';
      if (!stop && rank > best && patience > 0) {
        // from the smaller road: wait for a gap in everything that is coming
        if (room < 14) cap = Math.min(cap, Math.sqrt(16 + 2 * B_EASY * Math.max(0, room)));
        for (const w of this.vehicles) {
          if (w === v || w.dead || w.cur.e === c.e || this.endNode(w.cur) !== n) continue;
          const dw = w.cur.len - w.s;
          if (dw < Math.max(26, w.v * 5) * patience && (w.v > 0.6 || w.holds === n) && this.g.etype[w.cur.e] < rank) { stop = 'yield'; break; }
        }
      }
    }
    if (stop) {
      const k = room <= 0.3 ? 0 : Math.sqrt(2 * B_EASY * (room - 0.3));
      if (k < cap) { cap = k; v.why = stop; }
    } else if (room < Math.max(2, v.v * 1.6) && !this.isSignal(n)) {
      // let in: the junction is this vehicle's until it has left it
      this.release(v); // (a short street: the junction behind may still be held)
      let held = this.holders.get(n);
      if (!held) this.holders.set(n, (held = []));
      held.push({ id: v.id, from: c.e, to, t: this.time });
      v.holds = n;
    }
    return cap;
  }

  private release(v: Vehicle): void {
    if (v.holds < 0) return;
    const held = this.holders.get(v.holds);
    if (held) {
      const i = held.findIndex((h) => h.id === v.id);
      if (i >= 0) held.splice(i, 1);
      if (!held.length) this.holders.delete(v.holds);
    }
    v.holds = -1;
  }

  /** Speed limit set by whatever is in the path ahead. */
  private follow(v: Vehicle, limit: number, obstacles: readonly Obstacle[]): number {
    const half = SIZE[v.kind].half, hw = SIZE[v.kind].hw, look = half + 4 + v.v * 2.4;
    // the path ahead as a polyline from the front bumper
    const px = this.fx, pz = this.fz, pd = this.fd;
    let n = 0;
    for (let i = -1; i < SAMPLE.length; i++) {
      const d = half + (i < 0 ? 0 : SAMPLE[i]);
      this.pathPoint(v, d, P);
      px[n] = P.x; pz[n] = P.z; pd[n++] = d;
      if (d > look) break;
    }
    /** Distance along the path at which a circle (x, z, r) is met, or Infinity. */
    const meet = (x: number, z: number, r: number): number => {
      for (let i = 1; i < n; i++) {
        const ax = px[i - 1], az = pz[i - 1], vx = px[i] - ax, vz = pz[i] - az, l2 = vx * vx + vz * vz;
        if (l2 < 1e-6) continue;
        const t = ((x - ax) * vx + (z - az) * vz) / l2;
        if (t <= 0 && i === 1) continue; // beside or behind the front bumper
        const c = t < 0 ? 0 : t > 1 ? 1 : t, dx = x - ax - vx * c, dz = z - az - vz * c;
        if (dx * dx + dz * dz < r * r) return pd[i - 1] + (pd[i] - pd[i - 1]) * c;
      }
      return Infinity;
    };
    const hx = Math.sin(v.heading), hz = Math.cos(v.heading), reach = look + 8;
    let gap = Infinity, lead = 0;
    v.blocker = 0;
    if (v.ghost <= 0) for (const w of this.vehicles) {
      if (w === v || w.dead || Math.abs(w.x - v.x) > reach || Math.abs(w.z - v.z) > reach) continue;
      const wh = SIZE[w.kind], r = wh.hw + hw * 0.6 + 0.15, wx = Math.sin(w.heading), wz = Math.cos(w.heading);
      // a vehicle is long: its middle and both ends
      let d = Infinity;
      for (let k = -0.7; k < 0.8; k += 0.7) d = Math.min(d, meet(w.x + wx * wh.half * k, w.z + wz * wh.half * k, r));
      const g = d - half - wh.half * 0.3 - 1.3;
      if (g < gap) { gap = g; v.blocker = w.id; lead = w.v * Math.max(0, wx * hx + wz * hz); }
    }
    let other = false;
    if (v.past <= 0) for (const o of obstacles) {
      if (Math.abs(o.x - v.x) > reach || Math.abs(o.z - v.z) > reach) continue;
      const g = meet(o.x, o.z, o.r + hw + 0.2) - half - o.r - 1.3;
      if (g < gap) { gap = g; v.blocker = 0; other = true; lead = Math.max(0, o.vx * hx + o.vz * hz); }
    }
    // (something left standing in the road, a parked car or a player who will not move: after 12 s the driver edges past)
    v.held = other && v.v < 0.15 ? v.held + this.step : 0;
    if (v.held > 12) { v.held = 0; v.past = 5; }
    if (gap === Infinity) return v.past > 0 ? Math.min(limit, 3) : limit;
    return Math.min(limit, gap <= 0 ? 0 : Math.sqrt(lead * lead + 2 * B_FOLLOW * gap));
  }

  private place(v: Vehicle, dt: number, snap: boolean): void {
    this.pathPoint(v, 0, P);
    v.x = P.x; v.z = P.z;
    const target = Math.atan2(P.tx, P.tz), h = this.host;
    if (snap) { v.heading = target; v.y = v.gy = h.ground(v.x, v.z, v.y); v.pitch = v.gp = 0; return; }
    // the body turns toward the direction of its lane (which steps sideways at each bend of the centre line)
    v.heading += Math.atan2(Math.sin(target - v.heading), Math.cos(target - v.heading)) * Math.min(1, dt * 10);
    // The ground is the dear part on a phone: it is looked up every second frame (every fourth without pitch), each
    // vehicle in its turn, and the body eases to it.
    if ((this.frame + v.id) % (this.pitch ? 2 : 4) === 0) {
      v.gy = h.ground(v.x, v.z, v.y + 0.5);
      if (this.pitch) {
        const sx = Math.sin(v.heading) * 1.25, sz = Math.cos(v.heading) * 1.25;
        v.gp = Math.atan2(h.ground(v.x + sx, v.z + sz, v.y + 0.9) - h.ground(v.x - sx, v.z - sz, v.y + 0.9), 2.5);
      }
    }
    const k = Math.min(1, dt * 12);
    v.y += (v.gy - v.y) * k;
    v.pitch += (v.gp - v.pitch) * k;
  }

  /** Put one vehicle on the road near the focus. Returns it, or null when no free place was found. */
  spawn(fx: number, fz: number, o: FillOptions, rMin = o.rMin): Vehicle | null {
    const g = this.g;
    if (Math.hypot(fx - this.poolAt[0], fz - this.poolAt[1]) > 40 || this.poolAt[2] !== o.rMax) {
      this.poolAt = [fx, fz, o.rMax];
      this.pool = [];
      const r = o.rMax + 60;
      for (let e = 0; e < g.edgeCount; e++) if (this.ok[e] && g.elen[e] >= 18 && !(g.eflags[e] & EDGE_BRIDGE) && Math.abs(this.mx[e] - fx) < r && Math.abs(this.mz[e] - fz) < r) this.pool.push(e);
    }
    if (!this.pool.length) return null;
    let total = 0;
    for (const k of o.kinds) total += k;
    for (let attempt = 0; attempt < 6; attempt++) {
      const e = this.pool[Math.floor(this.rand() * this.pool.length)], len = g.elen[e];
      const fwd = !this.good[e * 2 + 1] || (this.good[e * 2] === 1 && this.rand() < 0.5), s = 8 + this.rand() * (len - 16);
      let kind = 0, r = this.rand() * total;
      for (; kind < o.kinds.length - 1; kind++) if ((r -= o.kinds[kind]) <= 0) break;
      const cur = this.leg(e, fwd, kind);
      this.lane(cur, s, P);
      const x = P.x, z = P.z, d = Math.hypot(x - fx, z - fz);
      if (d < rMin || d > o.rMax || !this.host.loaded(x, z)) continue;
      if (this.vehicles.some((w) => Math.hypot(w.x - x, w.z - z) < 16)) continue;
      const v: Vehicle = {
        id: this.nextId++, kind, tint: Math.floor(this.rand() * o.tints), prev: null, cur, next: this.choose(cur, kind), s,
        v: 0, pace: 0.82 + this.rand() * 0.3, x, y: -1e6, z, heading: 0, pitch: 0, gy: 0, gp: 0, braking: false, why: '', stuck: 0, ghost: 0, blocker: 0, waited: 0, held: 0, past: 0, holds: -1, dead: false, cap: 0, since: this.rand() * THINK,
      };
      // (it appears already moving, but never too fast to stop at the junction ahead)
      v.v = v.cap = Math.min((SPEED[g.typeOf(e)] ?? 8) * v.pace * 0.7, Math.sqrt(2 * B_EASY * Math.max(0, len - s - Math.min(7, len * 0.4) - 1)));
      this.place(v, 0, true);
      this.vehicles.push(v);
      return v;
    }
    return null;
  }

  /**
   * Advance the traffic by dt seconds round the focus. `obstacles` are the walkers and the player. `fresh` fills the
   * ring from close by (the first fill, and after the player has been moved somewhere else).
   */
  update(dt: number, fx: number, fz: number, o: FillOptions, obstacles: readonly Obstacle[] = [], fresh = false): void {
    this.time += dt; this.frame++;
    const g = this.g, list = this.vehicles;
    for (const v of list) {
      if (v.ghost > 0) v.ghost -= dt;
      if (v.past > 0) v.past -= dt;
      v.since += dt;
      if (v.since >= THINK) {
        this.step = v.since; v.since = 0;
        const type = g.typeOf(v.cur.e), free = (SPEED[type] ?? 8) * v.pace * (v.kind === KIND.kapcai ? 1.06 : 1);
        let cap = free;
        // bends of the street itself
        const bends = this.bendsOf(v.cur.e), sa = v.cur.fwd ? v.s : v.cur.len - v.s;
        for (const b of bends) {
          const ahead = v.cur.fwd ? b - sa : sa - b;
          if (ahead > -2 && ahead < 30) cap = Math.min(cap, Math.sqrt(25 + 2 * B_EASY * Math.max(0, ahead - 3)));
        }
        cap = this.junction(v, cap);
        const f = this.follow(v, cap, obstacles);
        if (f < cap) { cap = f; v.why = 'follow'; }
        v.cap = cap;
        // A deadlock is broken by letting one vehicle through: only a real one, where the chain of who waits for whom
        // comes back to this vehicle (a queue at a red light or behind a parked car is not a deadlock).
        let ring = false;
        if (v.v < 0.15 && v.why === 'follow' && v.blocker) {
          let w = list.find((q) => q.id === v.blocker);
          for (let hop = 0; hop < 6 && w && w.v < 0.15 && w.why === 'follow' && w.blocker; hop++) {
            if (w.blocker === v.id) { ring = true; break; }
            const next = w.blocker;
            w = list.find((q) => q.id === next);
          }
        }
        if (ring) { v.stuck += this.step; if (v.stuck > 8) { v.stuck = 0; v.ghost = 3.5; } } else v.stuck = 0;
      }
      const cap = v.cap;
      v.braking = cap < v.v - 0.25 || (cap < 0.3 && v.v < 0.3);
      if (cap > v.v) v.v = Math.min(cap, v.v + ACCEL * (v.kind === KIND.kapcai ? 1.35 : 1) * dt);
      else v.v = Math.max(cap, v.v - B_MAX * dt);
      v.waited = v.v < 0.3 && v.why === 'yield' ? v.waited + dt : v.v > 2 ? 0 : v.waited;
      v.s += v.v * dt;
      if (v.s >= v.cur.len) {
        if (!v.next) { v.dead = true; continue; }
        v.s -= v.cur.len;
        v.prev = v.cur; v.cur = v.next; v.next = this.choose(v.cur, v.kind);
      }
      if (v.holds >= 0 && v.prev && this.endNode(v.prev) === v.holds && v.s > 6) this.release(v);
      this.place(v, dt, false);
      // (whether it is still wanted is looked at every eighth frame, each vehicle in its turn)
      if (((this.frame + v.id) & 7) === 0 && (Math.hypot(v.x - fx, v.z - fz) > o.far || !this.host.loaded(v.x, v.z))) v.dead = true;
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) { this.release(list[i]); list.splice(i, 1); }
    // stale permissions (their holder left the map some other way): swept once a second
    if (this.holders.size && this.time - this.swept > 1) {
      this.swept = this.time;
      for (const [n, held] of this.holders) { const keep = held.filter((h) => this.time - h.t < 12); if (keep.length) this.holders.set(n, keep); else this.holders.delete(n); }
    }
    const tries = fresh ? o.want * 3 : 2;
    for (let i = 0; i < tries && list.length < o.want; i++) this.spawn(fx, fz, o, fresh ? Math.min(o.rMin, 24) : o.rMin);
  }

  /** A new budget: remove the kinds that are no longer drawn and whatever is over the number wanted. */
  trim(kinds: readonly number[], max: number): void {
    const list = this.vehicles;
    for (let i = list.length - 1; i >= 0; i--) if (!(kinds[list[i].kind] > 0) || i >= max) { this.release(list[i]); list.splice(i, 1); }
  }

  clear(): void {
    this.vehicles.length = 0;
    this.holders.clear();
  }
}
