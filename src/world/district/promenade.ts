// N1-M5 Kuching Waterfront promenade: where the paved walk, the railing panels and the Square Tower forecourt lie.
// Pure geometry (no three.js): the mesh builders and the unit tests read the same lists.
//
// WHAT IS REAL: the river-bank line the railing follows and the Square Tower outline (OpenStreetMap, unchanged).
// VERIFIED FORM (from the Commons photographs listed in docs/night/m5-main-bazaar-waterfront.md): a paved riverside
// walk behind a dark cast-iron railing whose panels carry rings, lamp posts with festoon lights between them, benches,
// palms and rain trees.
// APPROXIMATE: the width of the paved walk, the paving colours and band spacing, the ring-medallion stand-in for the
// real swirl mosaics, every dimension of the railing, and all positions of lamps, benches, palms and bins.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { ROAD_TYPES } from '../types.ts';
import { stationOf } from './mainBazaar.ts';

/** The walk's landward direction at a point is the average of the bank's normals this far either side (metres). */
export const NORMAL_SPAN = 9;
/** Paved walk: full width behind the railing, and the least it is narrowed to before it is left out. */
export const PROM_WIDTH = 9;
export const PROM_MIN = 2.5;
/** Distance of the railing-side coping and the landward border band, and the spacing of the cross bands. */
export const PROM_COPING = 0.5;
export const PROM_BAND = 5.5;
/** Spacing of the paving medallions along the walk. */
export const PROM_MEDALLION = 33;
/** Railing: post spacing and ring spacing along the bank. */
export const RAIL_POST = 2.4;
export const RAIL_RING = 0.8;
/** OSM way of the Square Tower. */
export const SQUARE_TOWER_ID = 817868530;
/** Width of the paved apron round the Square Tower. */
export const TOWER_APRON = 3.2;

/** The promenade kit reaches this far from the Main Bazaar centre line (the same reach as the lamps and benches). */
export const PROM_REACH = 120;

export interface WalkNode {
  /** World metres, on the railing line. */
  x: number; z: number;
  /** Unit landward normal (mitred at bends). */
  nx: number; nz: number;
  /** Metres along the railing from the start of this run. */
  s: number;
  /** Paved width at this node (0 = none). */
  w: number;
}

function pointInRing(x: number, z: number, r: ArrayLike<number>): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const walkCache = new Map<string, WalkNode[][]>();
/**
 * The paved walk of one chunk: runs of nodes at most 2.2 m apart along each railing line within reach of Main Bazaar.
 * The walk is narrowed where its landward edge would lie in water or on a carriageway.
 */
export function promenadeWalk(data: ChunkData): WalkNode[][] {
  const key = `${data.cx}_${data.cz}`;
  const hit = walkCache.get(key);
  if (hit) return hit;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const water = data.water.map((poly) => poly[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT));
  const inWater = (x: number, z: number) => water.some((r) => pointInRing(x, z, r));
  const roads = data.roads.filter((r) => { const t = ROAD_TYPES[r.t]; return t !== 'footway' && t !== 'path' && t !== 'pier' && t !== 'steps' && t !== 'pedestrian' && !(r.f & 1); });
  const onRoad = (x: number, z: number, pad: number) => roads.some((r) => {
    for (let i = 2; i < r.p.length; i += 2) {
      const ax = ox + r.p[i - 2] / QUANT, az = oz + r.p[i - 1] / QUANT, vx = ox + r.p[i] / QUANT - ax, vz = oz + r.p[i + 1] / QUANT - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(ax + vx * t - x, az + vz * t - z) < r.w / QUANT / 2 + pad) return true;
    }
    return false;
  });
  const out: WalkNode[][] = [];
  for (const rail of data.rail ?? []) {
    const P: [number, number][] = [];
    for (let i = 0; i < rail.length; i += 2) {
      const x = ox + rail[i] / QUANT, z = oz + rail[i + 1] / QUANT;
      if (!P.length || Math.hypot(x - P[P.length - 1][0], z - P[P.length - 1][1]) > 0.3) P.push([x, z]);
    }
    if (P.length < 2) continue;
    // landward side: decided once per line, by the majority of its segments
    let vote = 0;
    const seg = P.slice(1).map((b, i) => { const a = P[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return { tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, l }; });
    seg.forEach((g, i) => {
      const mx = (P[i][0] + P[i + 1][0]) / 2, mz = (P[i][1] + P[i + 1][1]) / 2;
      const a = inWater(mx - g.tz * 3, mz + g.tx * 3), b = inWater(mx + g.tz * 3, mz - g.tx * 3);
      if (a !== b) vote += (a ? -1 : 1) * g.l;
    });
    const sgn = vote >= 0 ? 1 : -1;
    // nodes along the whole line: mitred normal at a vertex, the segment's own normal between vertices
    const line: WalkNode[] = [];
    let s = 0;
    for (let i = 0; i < P.length; i++) {
      const g0 = seg[Math.max(0, i - 1)], g1 = seg[Math.min(seg.length - 1, i)];
      let mx = -(g0.tz + g1.tz) * sgn, mz = (g0.tx + g1.tx) * sgn;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      line.push({ x: P[i][0], z: P[i][1], nx: mx, nz: mz, s, w: 0 });
      if (i === P.length - 1) break;
      const g = seg[i], n = Math.max(1, Math.ceil(g.l / 2.2));
      for (let k = 1; k < n; k++) { const t = k / n; s += g.l / n; line.push({ x: P[i][0] + g.tx * g.l * t, z: P[i][1] + g.tz * g.l * t, nx: -g.tz * sgn, nz: g.tx * sgn, s, w: 0 }); }
      s += g.l / n;
    }
    // The landward direction is averaged over NORMAL_SPAN metres of bank either side. Where the bank jogs (the jetty
    // near the Square Tower turns a right angle within 5 m) the raw normals swing faster than the walk is wide, and
    // its landward edge would double back over itself.
    const smooth = line.map((a) => {
      let x = 0, z = 0;
      for (const b of line) { const d = Math.abs(b.s - a.s); if (d <= NORMAL_SPAN) { const k = 1 - d / (NORMAL_SPAN + 1); x += b.nx * k; z += b.nz * k; } }
      const l = Math.hypot(x, z) || 1;
      return [x / l, z / l];
    });
    line.forEach((a, i) => { a.nx = smooth[i][0]; a.nz = smooth[i][1]; });
    let run: WalkNode[] = [];
    const flush = () => { if (run.length > 1) out.push(run); run = []; };
    for (const a of line) {
      if (stationOf(a.x, a.z).d > PROM_REACH) { flush(); continue; }
      for (let d = PROM_MIN; d <= PROM_WIDTH + 1e-6; d += 0.5) { if (inWater(a.x + a.nx * d, a.z + a.nz * d) || onRoad(a.x + a.nx * d, a.z + a.nz * d, 0.4)) break; a.w = d; }
      if (a.w < PROM_MIN) { flush(); continue; }
      run.push(a);
    }
    flush();
  }
  for (const run of out) {
    // a walk never widens or narrows by more than its own step between two nodes (no saw teeth at a road edge)
    for (let i = 1; i < run.length; i++) run[i].w = Math.min(run[i].w, run[i - 1].w + 1);
    for (let i = run.length - 2; i >= 0; i--) run[i].w = Math.min(run[i].w, run[i + 1].w + 1);
    // and where the bank still turns faster than that, it is narrowed until its landward edge runs forward
    for (let pass = 0; pass < 12; pass++) {
      let folded = false;
      for (let i = 1; i < run.length; i++) {
        const a = run[i - 1], b = run[i], tx = b.x - a.x, tz = b.z - a.z;
        if ((b.x + b.nx * b.w - a.x - a.nx * a.w) * tx + (b.z + b.nz * b.w - a.z - a.nz * a.w) * tz > 0.02 * (tx * tx + tz * tz)) continue;
        a.w = Math.max(PROM_MIN, a.w - 0.5); b.w = Math.max(PROM_MIN, b.w - 0.5); folded = true;
      }
      if (!folded) break;
    }
  }
  walkCache.set(key, out);
  return out;
}

/** Outer ring of the Square Tower in this chunk (world metres), or null. */
export function squareTowerRing(data: ChunkData): number[] | null {
  const b = data.buildings.find((q) => q.id === SQUARE_TOWER_ID);
  if (!b) return null;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  return b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
}

/** A ring pushed outward by d metres (mitred corners). Works for either winding. */
export function offsetRing(ring: number[], d: number): number[] {
  const n = ring.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1]; }
  const sg = area > 0 ? 1 : -1; // outward normal of edge (tx, tz) is (tz, -tx) * sg
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const ax = ring[i * 2] - ring[p * 2], az = ring[i * 2 + 1] - ring[p * 2 + 1], al = Math.hypot(ax, az) || 1;
    const bx = ring[q * 2] - ring[i * 2], bz = ring[q * 2 + 1] - ring[i * 2 + 1], bl = Math.hypot(bx, bz) || 1;
    const n0x = (az / al) * sg, n0z = (-ax / al) * sg, n1x = (bz / bl) * sg, n1z = (-bx / bl) * sg;
    let mx = n0x + n1x, mz = n0z + n1z;
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.35, mx * n0x + mz * n0z);
    out.push(ring[i * 2] + mx * k, ring[i * 2 + 1] + mz * k);
  }
  return out;
}
