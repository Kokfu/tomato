// Street dressing of the Main Bazaar district: where the median, parked cars, trees, lamps, benches
// and boats stand. Pure geometry (no three.js): the mesh builder draws these and the collision
// world blocks them, from the same list.
//
// EVERYTHING HERE IS AN APPROXIMATION. The street layout it follows is real (two one-way
// carriageways with a raised median, kerbside parking on the shophouse side, a brick footpath and
// large rain trees on the river side, globe lamps and benches along the promenade railing: all
// seen in the reference photographs listed in docs/V3_REPORT.md), but no individual car, tree, lamp
// or bench position is surveyed.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { ROAD_TYPES } from '../types.ts';
import { MB_CARRIAGEWAY, MB_LINE, MB_NORTH, lineLength, pointAt, stationOf } from './mainBazaar.ts';
import { m5Enabled } from './m5.ts';
import { TOWER_APRON, offsetRing, squareTowerRing } from './promenade.ts';

const HALF = MB_CARRIAGEWAY / 2;

/** N1-M5 adds festoon (a string of lights from this lamp to the next: tx, tz hold the whole span), palm, bin and kapcai. */
export const PROP = { car: 0, rainTree: 1, planter: 2, medianLamp: 3, globeLamp: 4, bench: 5, boat: 6, bollard: 7, festoon: 8, palm: 9, bin: 10, kapcai: 11 } as const;

export interface Prop {
  kind: number;
  /** World metres. */
  x: number; z: number;
  /** Unit vector of the prop's long axis / facing. */
  tx: number; tz: number;
  /** Variation bits. */
  v: number;
}

/** Footprint half extents (along, across) and height used for collision; null = does not block. */
export function propSize(p: Prop): { ha: number; hb: number; h: number } | null {
  switch (p.kind) {
    case PROP.car: return { ha: p.v % 5 === 4 ? 2.55 : 2.05, hb: 0.9, h: 1.5 };
    case PROP.rainTree: return { ha: 0.4, hb: 0.4, h: 4 };
    case PROP.planter: return { ha: 0.34, hb: 0.34, h: 1 };
    case PROP.medianLamp: return { ha: 0.12, hb: 0.12, h: 9 };
    case PROP.globeLamp: return { ha: 0.14, hb: 0.14, h: 4 };
    case PROP.bench: return { ha: 0.85, hb: 0.3, h: 0.9 };
    case PROP.bollard: return { ha: 0.14, hb: 0.14, h: 0.9 };
    case PROP.palm: return { ha: 0.2, hb: 0.2, h: 5 };
    case PROP.bin: return { ha: 0.28, hb: 0.28, h: 1 };
    case PROP.kapcai: return { ha: 0.92, hb: 0.3, h: 1.1 };
    default: return null;
  }
}

function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 2654435761) ^ Math.imul(b + 0x9e3779b9, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stations along MB_LINE where a side street joins (no parking, no median). */
const JUNCTIONS = [stationOf(218.2, -68.7).s, stationOf(288.8, -17.8).s + 2];
const nearJunction = (s: number, pad: number) => JUNCTIONS.some((j) => Math.abs(s - j) < pad);

export interface MedianNode { x: number; z: number; tx: number; tz: number; hw: number }
let medianCache: MedianNode[][] | null = null;
/** Centre line and half width of the raised median between the two carriageways, split at junctions. */
export function medianRuns(): MedianNode[][] {
  if (medianCache) return medianCache;
  const runs: MedianNode[][] = [];
  let cur: MedianNode[] = [];
  const L = lineLength(MB_LINE);
  for (let s = 16; s <= L - 14; s += 2) {
    const p = pointAt(MB_LINE, s);
    const q = stationOf(p.x, p.z, MB_NORTH);
    const gap = q.d;
    const ok = gap > MB_CARRIAGEWAY + 0.9 && gap < 14 && !nearJunction(s, 7);
    if (!ok) { if (cur.length > 2) runs.push(cur); cur = []; continue; }
    // River side of the shophouse carriageway is (tz, -tx).
    cur.push({ x: p.x + p.tz * (gap / 2), z: p.z - p.tx * (gap / 2), tx: p.tx, tz: p.tz, hw: Math.min(1.3, (gap - MB_CARRIAGEWAY) / 2 - 0.12) });
  }
  if (cur.length > 2) runs.push(cur);
  return (medianCache = runs);
}

const cache = new Map<boolean, Prop[]>();
/** District-wide props that do not depend on chunk data. */
function staticProps(): Prop[] {
  const m5 = m5Enabled(), hit = cache.get(m5);
  if (hit) return hit;
  const out: Prop[] = [];
  const L = lineLength(MB_LINE);
  // Kerbside parking in front of the shophouses.
  for (let s = 20, i = 0; s < L - 12; i++) {
    const h = hash(i, 11);
    const len = h % 5 === 4 ? 5.1 : 4.1;
    if (h % 100 < 68 && !nearJunction(s, 11)) {
      const p = pointAt(MB_LINE, s);
      const dir = 1; // one-way, traffic runs west to east on the shophouse side (decorative assumption)
      out.push({ kind: PROP.car, x: p.x - p.tz * (HALF - 1.02), z: p.z + p.tx * (HALF - 1.02), tx: p.tx * dir, tz: p.tz * dir, v: h });
    } else if (m5 && !nearJunction(s, 11)) {
      // N1-M5: an empty bay holds a row of kapcai motorbikes, nose to the kerb (typical of the street; none is surveyed)
      const p = pointAt(MB_LINE, s);
      for (let k = 0, n = 2 + (h >>> 12) % 3; k < n; k++) {
        const a = -1.3 + k * 0.85, lean = (((h >>> (16 + k)) & 3) - 1.5) * 0.06;
        out.push({ kind: PROP.kapcai, x: p.x + p.tx * a - p.tz * (HALF - 0.95), z: p.z + p.tz * a + p.tx * (HALF - 0.95), tx: -p.tz + p.tx * lean, tz: p.tx + p.tz * lean, v: hash(i, 60 + k) });
      }
    }
    s += len + 1.3 + (h >>> 8) % 3 * 0.5;
  }
  // Median: planter pots every ~10 m, twin-arm lamp columns every ~30 m.
  medianRuns().forEach((run, r) => {
    run.forEach((m, k) => {
      if (k % 15 === 7) out.push({ kind: PROP.medianLamp, x: m.x, z: m.z, tx: m.tx, tz: m.tz, v: hash(k, r) });
      else if (k % 5 === 2) out.push({ kind: PROP.planter, x: m.x, z: m.z, tx: m.tx, tz: m.tz, v: hash(k, r + 40) });
    });
  });
  // River side of the street: rain trees in the verge behind the brick footpath.
  const LN = lineLength(MB_NORTH);
  for (let s = 12, i = 0; s < LN - 8; s += 15 + (hash(i, 5) % 5), i++) {
    const p = pointAt(MB_NORTH, s);
    const off = HALF + 5.4 + (hash(i, 9) % 3) * 0.6;
    out.push({ kind: PROP.rainTree, x: p.x + p.tz * off, z: p.z - p.tx * off, tx: p.tx, tz: p.tz, v: hash(i, 21) });
  }
  cache.set(m5, out);
  return out;
}

function pointInRing(x: number, z: number, r: ArrayLike<number>): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToRing(x: number, z: number, r: ArrayLike<number>): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const ax = r[j], az = r[j + 1], vx = r[i] - ax, vz = r[i + 1] - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
}

const propCache = new Map<string, Prop[]>();
/** Props standing in one chunk (world coordinates), with anything on a building, road or water removed. */
export function chunkProps(data: ChunkData): Prop[] {
  const m5 = m5Enabled(), key = `${data.cx}_${data.cz}${m5 ? '+' : ''}`;
  const hit = propCache.get(key);
  if (hit) return hit;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const inChunk = (x: number, z: number) => Math.floor(x / CHUNK_SIZE) === data.cx && Math.floor(z / CHUNK_SIZE) === data.cz;
  const rings = data.buildings.map((b) => b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT));
  const water = data.water.map((poly) => poly[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT));
  const inWater = (x: number, z: number) => water.some((r) => pointInRing(x, z, r));
  const nearBuilding = (x: number, z: number, pad: number) => rings.some((r) => pointInRing(x, z, r) || distToRing(x, z, r) < pad);
  const roads = data.roads.filter((r) => { const t = ROAD_TYPES[r.t]; return t !== 'footway' && t !== 'path' && t !== 'pier' && t !== 'steps' && !(r.f & 1); });
  const onRoad = (x: number, z: number, pad: number) => roads.some((r) => {
    for (let i = 2; i < r.p.length; i += 2) {
      const ax = ox + r.p[i - 2] / QUANT, az = oz + r.p[i - 1] / QUANT, vx = ox + r.p[i] / QUANT - ax, vz = oz + r.p[i + 1] / QUANT - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(ax + vx * t - x, az + vz * t - z) < r.w / QUANT / 2 + pad) return true;
    }
    return false;
  });
  const out: Prop[] = [];
  for (const p of staticProps()) {
    if (!inChunk(p.x, p.z)) continue;
    if (p.kind === PROP.rainTree && (nearBuilding(p.x, p.z, 2.5) || inWater(p.x, p.z) || onRoad(p.x, p.z, 1.2))) continue;
    out.push(p);
  }
  if (!stationOfChunk(data)) { propCache.set(key, out); return out; }
  // Promenade: globe lamps and benches behind the railing, bigger trees set back from it.
  let n = 0;
  for (const rail of data.rail ?? []) {
    let carry = 5;
    let lastLamp: { x: number; z: number; n: number } | null = null;
    for (let i = 2; i < rail.length; i += 2) {
      const ax = ox + rail[i - 2] / QUANT, az = oz + rail[i - 1] / QUANT, bx = ox + rail[i] / QUANT, bz = oz + rail[i + 1] / QUANT;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      // Landward normal: the side that is not water.
      let nx = -tz, nz = tx;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (inWater(mx + nx * 3, mz + nz * 3) && !inWater(mx - nx * 3, mz - nz * 3)) { nx = -nx; nz = -nz; }
      for (let s = carry; s < len; s += 5.5, n++) {
        const px = ax + tx * s, pz = az + tz * s;
        if (stationOf(px, pz).d > 120) continue;
        const place = (kind: number, off: number, pad: number, fx = nx, fz = nz): boolean => {
          const x = px + nx * off, z = pz + nz * off;
          if (!inChunk(x, z) || inWater(x, z) || nearBuilding(x, z, pad) || onRoad(x, z, 0.8)) return false;
          out.push({ kind, x, z, tx: fx, tz: fz, v: hash(n, kind) });
          return true;
        };
        if (n % 2 === 0 && place(PROP.globeLamp, 1.0, 0.6) && m5) {
          // N1-M5: festoon lights from the previous lamp of this line to this one (span kept in tx, tz)
          const x = px + nx, z = pz + nz;
          if (lastLamp && lastLamp.n === n - 2 && Math.hypot(x - lastLamp.x, z - lastLamp.z) < 13) out.push({ kind: PROP.festoon, x: lastLamp.x, z: lastLamp.z, tx: x - lastLamp.x, tz: z - lastLamp.z, v: hash(n, 77) });
          lastLamp = { x, z, n };
        }
        // palms stand in pairs clear of the rain trees, which then come every sixth step instead of every third
        if (m5 && (n % 6 === 2 || n % 6 === 3)) place(PROP.palm, 4.4, 1.5);
        if (m5 && n % 8 === 5) place(PROP.bin, 1.5, 0.6);
        if (n % 4 === 1) place(PROP.bench, 2.4, 1.2, tx, tz);
        if (n % 3 === 2 && !(m5 && n % 6 === 2)) place(PROP.rainTree, 8.5 + (hash(n, 3) % 4), 3);
      }
      carry = (carry + Math.ceil(Math.max(0, len - carry) / 5.5) * 5.5) - len;
    }
  }
  // N1-M5 Square Tower forecourt: globe lamps at the corners of the paved apron and a bench on each long side (generic).
  const tower = m5 ? squareTowerRing(data) : null;
  if (tower) {
    const ring = offsetRing(tower, TOWER_APRON + 0.7), m = ring.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], l = Math.hypot(bx - ax, bz - az) || 1;
      if (!inWater(ax, az) && !onRoad(ax, az, 0.8)) out.push({ kind: PROP.globeLamp, x: ax, z: az, tx: (bx - ax) / l, tz: (bz - az) / l, v: hash(i, 91) });
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (l > 9 && !inWater(mx, mz) && !onRoad(mx, mz, 0.8)) out.push({ kind: PROP.bench, x: mx, z: mz, tx: (bx - ax) / l, tz: (bz - az) / l, v: hash(i, 92) });
    }
  }
  // Tambang boats moored at the mapped jetties.
  for (const r of data.roads) {
    if (ROAD_TYPES[r.t] !== 'pier' || r.p.length < 4) continue;
    const m = r.p.length;
    const ax = ox + r.p[m - 4] / QUANT, az = oz + r.p[m - 3] / QUANT, bx = ox + r.p[m - 2] / QUANT, bz = oz + r.p[m - 1] / QUANT;
    const ends: [number, number, number, number][] = [[bx, bz, bx - ax, bz - az], [ox + r.p[0] / QUANT, oz + r.p[1] / QUANT, r.p[0] - r.p[2], r.p[1] - r.p[3]]];
    for (const [ex, ez, dx, dz] of ends) {
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l;
      for (const side of [-1, 1]) {
        const x = ex + ux * 1.5 - uz * side * 2.6, z = ez + uz * 1.5 + ux * side * 2.6;
        if (inChunk(x, z) && inWater(x, z) && inWater(x + ux * 3, z + uz * 3) && inWater(x - ux * 3, z - uz * 3) && stationOf(x, z).d < 160) out.push({ kind: PROP.boat, x, z, tx: ux, tz: uz, v: hash(r.id, side + 2) });
      }
    }
  }
  propCache.set(key, out);
  return out;
}

/** True when the chunk overlaps the district at all. */
export function stationOfChunk(data: { cx: number; cz: number }): boolean {
  return data.cx >= 0 && data.cx <= 1 && data.cz >= -2 && data.cz <= 0;
}

export interface Obstacle { ring: number[]; h: number }
export function propObstacles(data: ChunkData): Obstacle[] {
  if (!stationOfChunk(data)) return [];
  const out: Obstacle[] = [];
  for (const p of chunkProps(data)) {
    const s = propSize(p);
    if (!s) continue;
    const r: number[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(p.x + p.tx * s.ha * a - p.tz * s.hb * b, p.z + p.tz * s.ha * a + p.tx * s.hb * b);
    out.push({ ring: r, h: s.h });
  }
  return out;
}

/** Raised paving the character stands on: the median and the brick footpath (world metres, height above terrain). */
export function districtFloors(data: { cx: number; cz: number }): { ring: number[]; rise: number }[] {
  if (!stationOfChunk(data)) return [];
  const out: { ring: number[]; rise: number }[] = [];
  const inChunk = (x: number, z: number) => Math.floor(x / CHUNK_SIZE) === data.cx && Math.floor(z / CHUNK_SIZE) === data.cz;
  for (const run of medianRuns()) {
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i];
      if (!inChunk(b.x, b.z)) continue;
      out.push({ ring: [a.x + a.tz * a.hw, a.z - a.tx * a.hw, a.x - a.tz * a.hw, a.z + a.tx * a.hw, b.x - b.tz * b.hw, b.z + b.tx * b.hw, b.x + b.tz * b.hw, b.z - b.tx * b.hw], rise: 0.16 });
    }
  }
  const LN = lineLength(MB_NORTH), k0 = HALF + 0.2, k1 = HALF + 2.62;
  for (let s = 10; s < LN - 8; s += 2) {
    const p = pointAt(MB_NORTH, s), q = pointAt(MB_NORTH, s + 2);
    if (!inChunk(p.x + p.tz * k0, p.z - p.tx * k0)) continue;
    out.push({ ring: [p.x + p.tz * k0, p.z - p.tx * k0, p.x + p.tz * k1, p.z - p.tx * k1, q.x + q.tz * k1, q.z - q.tx * k1, q.x + q.tz * k0, q.z - q.tx * k0], rise: 0.14 });
  }
  return out;
}
