// N1-M5 hero place 3: India Street (Jalan India) pedestrian mall and the Jalan Gambier frontage.
// Pure geometry and tables (no three.js): the mesh builder, the collision world, the sign pass and the unit tests
// all read the same lists.
//
// WHAT IS REAL (OpenStreetMap): the paved strip of India Street (way 69928034), which is the gap between the mapped
// blocks on its two sides; those block outlines; Jalan Gambier's centre line; the riverside car park and its lane;
// the shop names on the boards.
// VERIFIED FORM (two Commons photographs by Fabio Achilli, CC BY 2.0, see docs/night/m5-india-street-gambier.md): a
// pedestrian street under a continuous steel-and-fabric canopy carried on tall white columns down the middle,
// light tile paving laid in a diamond pattern, two-storey shops in bright paint, air-conditioner units on the upper
// walls, Malaysian flags, textile stalls standing out in the street.
// APPROXIMATE: every lot (width, colour, shopfront, which lot has an awning, a flag or a stall), every dimension of
// the canopy, the paving colours, and the whole of Jalan Gambier (no photograph): its parked cars, kapcai, blinds
// and the cars in the riverside car park are typical street life, placed by rule.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { BuildingData, ChunkData } from '../types.ts';
import { ARCH_CLASSES, BUILDING_KINDS, FURN, ROAD_STYLE, ROAD_TYPES } from '../types.ts';
import { edgeOutward, hash3, insetEdges, ringArea2, unitsAlong } from '../arch/frontage.ts';
import { m5Enabled } from './m5.ts';

export const INDIA_KEY = '-1_-1';
/** The mapped block on the north side of India Street (one outline, 182 m of frontage on a street that climbs 3 m). */
export const NORTH_BLOCK = 233689138;
/** The mapped block that fronts Jalan Gambier (edges 14 to 22) and the west mouth of India Street (edge 23). */
export const GAMBIER_BLOCK = 233689135;
export const GAMBIER_WAY = 217916874;
export const CARPARK_LANE = 217926882;
/** Depth of the north row's shophouses, and how many stepped pieces each of its two frontage edges is cut into. */
export const SLICE_DEPTH = 14;
const SLICES = [3, 4];
export const sliceId = (k: number): number => NORTH_BLOCK * 100 + k;
/** India Street frontage edges added to the mapped blocks of its south side (edge i runs from ring vertex i to i + 1). */
const SOUTH_FRONTS: Record<number, number[]> = { 233689193: [1], 235772981: [3], 235772967: [3] };
const GAMBIER_EDGES = [14, 15, 16, 17, 18, 19, 20, 21, 22];

/** The two frontage lines of India Street (world metres, west to east): vertices of the mapped blocks. */
export const INDIA_NORTH: [number, number][] = [[-188.2, -154.9], [-118.3, -131.2], [-15.3, -98.5]];
export const INDIA_SOUTH: [number, number][] = [[-213.2, -149.6], [-179.2, -139.2], [-171.7, -137.7], [-134.1, -126.1], [-127.2, -122.9], [-27.4, -87.3]];
/** The segment of INDIA_SOUTH that is the mouth of Lorong Kai Joo, not a shopfront. */
const KAI_JOO_SEG = 3;

/** Canopy: column spacing, where it starts and stops short of the street ends, its height above the paving. */
export const POST_STEP = 12;
export const CANOPY_INSET = 6;
export const CANOPY_EAVES = 9.6;
export const CANOPY_RISE = 1.15;
export const POST_R = 0.26;
/** Stalls stand this far out from the frontage line (their middle), one per STALL_STEP metres a side. */
export const STALL_OUT = 2.1;
export const STALL_STEP = 7.5;

/** Which hero frontage a lot belongs to (null = none, or the flag is off). */
export function heroFront(id: number, edge: number): 'india' | 'gambier' | null {
  if (!m5Enabled()) return null;
  if (id === GAMBIER_BLOCK) return edge === 23 ? 'india' : GAMBIER_EDGES.includes(edge) ? 'gambier' : null;
  if (SOUTH_FRONTS[id]?.includes(edge)) return 'india';
  if (edge === 0 && id > NORTH_BLOCK * 100 && id <= NORTH_BLOCK * 100 + SLICES[0] + SLICES[1]) return 'india';
  return null;
}

// Bright paint, as in the photographs: yellow, blue, green, orange, pink, white, teal.
const INDIA_WALLS = [0xf4c63a, 0x3c82c8, 0x58b56e, 0xf28b3a, 0xea6f9a, 0xf6f1e4, 0x35b0ae, 0xf7e08a, 0xd9534a, 0x9a7bc9, 0xf4c63a, 0x7cc4e8];
const GAMBIER_BLINDS = [0x3f6b4f, 0x2f5d85, 0xb9a271, 0x8a3b32, 0xc7462f, 0xd9a43a];
/** Paint, blind and air-conditioner of one lot of a hero frontage (replaces the generic rule of arch/Shophouse.ts). */
export function heroLotStyle(id: number, edge: number, unit: number): { wall?: number; blind: number; ac: boolean } | null {
  const front = heroFront(id, edge);
  if (!front) return null;
  const h = hash3(id, edge * 17 + 5, unit);
  if (front === 'gambier') return { blind: h % 100 < 45 ? GAMBIER_BLINDS[(h >>> 8) % GAMBIER_BLINDS.length] : -1, ac: (h >>> 14) % 2 === 0 };
  let u = unit;
  while (u > 0 && hash3(id, edge * 29 + 3, u) % 100 < 28) u--; // two or three lots under one coat of paint now and then
  return { wall: INDIA_WALLS[hash3(id, edge * 17 + 5, u) % INDIA_WALLS.length], blind: -1, ac: (h >>> 14) % 10 < 7 };
}

/**
 * Rewrites the chunk's building list for the hero place (flag on, chunk -1_-1 only, idempotent):
 *  - the north block's India Street side becomes seven two-storey shophouse pieces, each 14 m deep with its own
 *    ground level (the street climbs 3 m; one level row would bury its east end), and the rest of the block is drawn
 *    two storeys high behind them (its mapped height is a default, and the photographs show two storeys);
 *  - the blocks on the south side and at the west mouth get India Street as a frontage: until now their only
 *    frontages were on the mapped ways (Lorong Kai Joo, Jalan Gambier), so the mall was lined with blank side walls.
 */
export function patchHeroData(data: ChunkData): void {
  if (!m5Enabled() || `${data.cx}_${data.cz}` !== INDIA_KEY) return;
  const bi = data.buildings.findIndex((b) => b.id === NORTH_BLOCK);
  if (bi >= 0 && !data.buildings.some((b) => b.id === sliceId(1))) {
    const b = data.buildings[bi], r = b.r[0], a2 = ringArea2(r), d = SLICE_DEPTH * QUANT;
    const slices: BuildingData[] = [];
    for (let e = 0, k = 0; e < 2; e++) {
      const ax = r[e * 2], az = r[e * 2 + 1], bx = r[e * 2 + 2], bz = r[e * 2 + 3];
      const [nx, nz] = edgeOutward(r, e, a2);
      for (let i = 0; i < SLICES[e]; i++) {
        const t0 = i / SLICES[e], t1 = (i + 1) / SLICES[e];
        const p0x = ax + (bx - ax) * t0, p0z = az + (bz - az) * t0, p1x = ax + (bx - ax) * t1, p1z = az + (bz - az) * t1;
        slices.push({
          id: sliceId(++k), r: [[p0x, p0z, p1x, p1z, p1x - nx * d, p1z - nz * d, p0x - nx * d, p0z - nz * d].map(Math.round)],
          h: 820, hs: 2, k: BUILDING_KINDS.indexOf('shophouse'), ac: ARCH_CLASSES.indexOf('shophouse'), ab: 1, a: { c: 1, f: [0], lv: 2 },
        });
      }
    }
    // hs 1 keeps the typed-building generator from replacing the height with a taller default of its own.
    data.buildings[bi] = { ...b, r: [insetEdges(r, [0, 1], d + 6).map(Math.round), ...b.r.slice(1)], h: 820, hs: 1 };
    data.buildings.push(...slices);
  }
  for (const b of data.buildings) {
    const add = SOUTH_FRONTS[b.id] ?? (b.id === GAMBIER_BLOCK ? [23] : null);
    if (!add || !b.a) continue;
    b.a = { ...b.a, f: [...new Set([...b.a.f, ...add])].sort((x, y) => x - y) };
  }
}

export interface SpineNode {
  /** Metres along the north frontage from its west end. */
  s: number;
  /** Point on the north frontage, unit tangent (eastward), unit normal towards the south frontage. */
  x: number; z: number; tx: number; tz: number; nx: number; nz: number;
  /** Clear width between the two frontages here, and the segment of INDIA_SOUTH the normal meets. */
  w: number; seg: number;
}

function along(line: [number, number][], s: number): [number, number] {
  for (let i = 1; i < line.length; i++) {
    const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (s <= l || i === line.length - 1) { const t = s / l; return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]; }
    s -= l;
  }
  return line[0];
}
export const INDIA_LENGTH = INDIA_NORTH.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - INDIA_NORTH[i][0], p[1] - INDIA_NORTH[i][1]), 0);

let spine: SpineNode[] | null = null;
/** The street frame: a node every 3 m of the north frontage, with the width across to the south frontage. */
export function indiaSpine(): SpineNode[] {
  if (spine) return spine;
  const out: SpineNode[] = [];
  const n = Math.round(INDIA_LENGTH / 3);
  for (let i = 0; i <= n; i++) {
    const s = (INDIA_LENGTH * i) / n;
    const [x, z] = along(INDIA_NORTH, s), a = along(INDIA_NORTH, Math.max(0, s - 4)), b = along(INDIA_NORTH, Math.min(INDIA_LENGTH, s + 4));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l, nx = -tz, nz = tx;
    let w = Infinity, seg = -1;
    for (let k = 1; k < INDIA_SOUTH.length; k++) {
      const p = INDIA_SOUTH[k - 1], q = INDIA_SOUTH[k], ex = q[0] - p[0], ez = q[1] - p[1];
      const den = nx * ez - nz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p[0] - x) * ez - (p[1] - z) * ex) / den, u = ((p[0] - x) * nz - (p[1] - z) * nx) / den;
      // the first and last segments run on past their ends: the street mouths are a little wider than the rows
      if (t > 0 && t < w && (u >= 0 || k === 1) && (u <= 1 || k === INDIA_SOUTH.length - 1)) { w = t; seg = k - 1; }
    }
    if (seg < 0) continue;
    out.push({ s, x, z, tx, tz, nx, nz, w, seg });
  }
  return (spine = out);
}

/** Canopy columns: on the middle line of the street. */
export function indiaPosts(): { x: number; z: number; s: number }[] {
  const sp = indiaSpine(), out: { x: number; z: number; s: number }[] = [];
  for (let s = CANOPY_INSET + 3; s < INDIA_LENGTH - CANOPY_INSET - 2; s += POST_STEP) {
    const a = sp.reduce((m, q) => (Math.abs(q.s - s) < Math.abs(m.s - s) ? q : m));
    out.push({ x: a.x + a.nx * a.w / 2 + a.tx * (s - a.s), z: a.z + a.nz * a.w / 2 + a.tz * (s - a.s), s });
  }
  return out;
}

/** Inside the paved strip between the two frontage lines. */
function inStrip(x: number, z: number): boolean {
  const r = [...INDIA_NORTH, ...[...INDIA_SOUTH].reverse()];
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}

export interface Stall { x: number; z: number; tx: number; tz: number; rack: boolean; parasol: boolean; h: number }
/** Textile stalls out in the street, in front of both rows (none across the mouth of Lorong Kai Joo). */
export function indiaStalls(): Stall[] {
  const sp = indiaSpine(), out: Stall[] = [];
  for (const side of [0, 1]) for (let s = side ? 9.75 : 6, k = 0; s < INDIA_LENGTH - 5; s += STALL_STEP, k++) {
    const a = sp.reduce((m, q) => (Math.abs(q.s - s) < Math.abs(m.s - s) ? q : m));
    const h = hash3(69928034, side, k);
    if (h % 5 === 0 || (side && a.seg === KAI_JOO_SEG)) continue;
    const d = side ? a.w - STALL_OUT : STALL_OUT, x = a.x + a.nx * d, z = a.z + a.nz * d;
    if (!inStrip(x, z)) continue; // the street mouths are wider than the rows are long
    out.push({ x, z, tx: a.tx, tz: a.tz, rack: (h >>> 4) % 2 === 0, parasol: (h >>> 7) % 2 === 0, h });
  }
  return out;
}

export interface Parked { x: number; z: number; tx: number; tz: number; kind: 'car' | 'kapcai'; h: number }
const parkedCache = new Map<string, Parked[]>();
/**
 * Jalan Gambier (chunk -1_-1): cars and kapcai parked along the shophouse-side kerb, and cars in the bays of the
 * mapped riverside car park. All Approximate: typical, placed by rule, clear of crossings, bus stops and junctions.
 */
export function gambierParked(data: ChunkData): Parked[] {
  const key = `${data.cx}_${data.cz}`;
  if (!m5Enabled() || key !== INDIA_KEY) return [];
  const hit = parkedCache.get(key);
  if (hit) return hit;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, out: Parked[] = [];
  const world = (p: number[]) => p.map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
  // keep clear of crossings, bus stops, box junctions and of every other street's mouth
  const keep: [number, number, number][] = [];
  const f = data.furn ?? [];
  for (let i = 0; i < f.length; i += 5) if (f[i] === FURN.zebra || f[i] === FURN.busStop || f[i] === FURN.box || f[i] === FURN.signal) keep.push([ox + f[i + 1] / QUANT, oz + f[i + 2] / QUANT, 10]);
  const gw = data.roads.find((r) => r.id === GAMBIER_WAY), gp = gw ? world(gw.p) : [];
  // signed offset of a point from Jalan Gambier's centre line: positive on the south (shophouse) side
  const south = (x: number, z: number) => {
    let best = Infinity, sg = 0;
    for (let i = 2; i < gp.length; i += 2) {
      const vx = gp[i] - gp[i - 2], vz = gp[i + 1] - gp[i - 1], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - gp[i - 2]) * vx + (z - gp[i - 1]) * vz) / l2));
      const d = Math.hypot(gp[i - 2] + vx * t - x, gp[i - 1] + vz * t - z);
      if (d < best) { best = d; sg = Math.sign(vx * (z - gp[i - 1]) - vz * (x - gp[i - 2])); }
    }
    return best * sg;
  };
  for (const r of data.roads) {
    const t = ROAD_TYPES[r.t];
    if (r.id === GAMBIER_WAY || t === 'stream' || t === 'rail') continue;
    const p = world(r.p);
    const d = ROAD_STYLE[t].group >= 2 ? 7.5 : 4;
    // a street that leaves Jalan Gambier on the river side does not empty the shop-side kerb opposite its mouth
    for (const [e, i] of [[0, 2], [p.length - 2, p.length - 4]]) if (south(p[i], p[i + 1]) > -1) keep.push([p[e], p[e + 1], d]);
  }
  const clear = (x: number, z: number) => keep.every(([kx, kz, d]) => Math.hypot(kx - x, kz - z) > d);
  const walk = (p: number[], step: number, from: number, put: (x: number, z: number, tx: number, tz: number, k: number) => void) => {
    let acc = 0, next = from, k = 0;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], l = Math.hypot(p[i] - ax, p[i + 1] - az);
      if (l < 1e-6) continue;
      const tx = (p[i] - ax) / l, tz = (p[i + 1] - az) / l;
      for (; next <= acc + l; next += step, k++) put(ax + tx * (next - acc), az + tz * (next - acc), tx, tz, k);
      acc += l;
    }
  };
  const gambier = data.roads.find((r) => r.id === GAMBIER_WAY);
  if (gambier) {
    const hw = gambier.w / QUANT / 2;
    walk(world(gambier.p), 6.4, 3, (x, z, tx, tz, k) => {
      if (x < -182 || x > -8) return; // the straight in front of the row
      const h = hash3(GAMBIER_WAY, 1, k), px = x - tz * (hw - 1.05), pz = z + tx * (hw - 1.05); // the south (shop) side
      if (!clear(x, z) || h % 100 >= 84) return;
      out.push({ x: px, z: pz, tx, tz, kind: h % 100 < 64 ? 'car' : 'kapcai', h });
    });
  }
  const lane = data.roads.find((r) => r.id === CARPARK_LANE);
  if (lane) {
    const p = world(lane.p);
    // the long side of the loop, between its two corners: bays at right angles on both sides
    let best = 2;
    for (let i = 2; i < p.length; i += 2) if (Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) > Math.hypot(p[best] - p[best - 2], p[best + 1] - p[best - 1])) best = i;
    const ax = p[best - 2], az = p[best - 1], l = Math.hypot(p[best] - ax, p[best + 1] - az), tx = (p[best] - ax) / l, tz = (p[best + 1] - az) / l;
    const hw = lane.w / QUANT / 2;
    for (const side of [-1, 1]) for (let s = 4.5, k = 0; s < l - 4; s += 2.7, k++) {
      const h = hash3(CARPARK_LANE, side + 2, k);
      if (h % 100 >= (side < 0 ? 62 : 45)) continue;
      const d = (hw + 2.6) * side;
      out.push({ x: ax + tx * s - tz * d, z: az + tz * s + tx * d, tx: -tz * side, tz: tx * side, kind: 'car', h });
    }
  }
  parkedCache.set(key, out);
  return out;
}

export interface Obstacle { ring: number[]; h: number }
const rect = (x: number, z: number, tx: number, tz: number, ha: number, hb: number): number[] => {
  const r: number[] = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(x + tx * ha * a - tz * hb * b, z + tz * ha * a + tx * hb * b);
  return r;
};
/** What blocks a walker (and a car) in the place: canopy columns, stalls, parked cars and kapcai. */
export function heroObstacles(data: ChunkData): Obstacle[] {
  if (!m5Enabled() || `${data.cx}_${data.cz}` !== INDIA_KEY) return [];
  const out: Obstacle[] = [];
  for (const p of indiaPosts()) out.push({ ring: rect(p.x, p.z, 1, 0, POST_R + 0.06, POST_R + 0.06), h: 8 });
  for (const s of indiaStalls()) out.push({ ring: rect(s.x, s.z, s.tx, s.tz, 1.0, 0.45), h: 1.7 });
  for (const c of gambierParked(data)) out.push({ ring: c.kind === 'car' ? rect(c.x, c.z, c.tx, c.tz, 2.1, 0.88) : rect(c.x, c.z, c.tx, c.tz, 1.5, 0.75), h: c.kind === 'car' ? 1.4 : 1.1 });
  return out;
}

/** The lots of the India Street frontages in this (patched) chunk: world ring of the building, edge, lot count. */
export function indiaFronts(data: ChunkData): { b: BuildingData; edge: number; ring: number[]; lots: number }[] {
  if (!m5Enabled() || `${data.cx}_${data.cz}` !== INDIA_KEY) return [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, out: { b: BuildingData; edge: number; ring: number[]; lots: number }[] = [];
  for (const b of data.buildings) for (const edge of b.a?.f ?? []) {
    if (heroFront(b.id, edge) !== 'india') continue;
    const ring = b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT), j = (edge + 1) % (ring.length / 2);
    out.push({ b, edge, ring, lots: unitsAlong(Math.hypot(ring[j * 2] - ring[edge * 2], ring[j * 2 + 1] - ring[edge * 2 + 1])).n });
  }
  return out;
}

const NOT_A_SHOP = new Set(['artwork', 'attraction', 'historic_site', 'hotel', 'viewpoint', 'information', 'atm', 'toilets', 'bench']);
/**
 * A mapped business that lies in one of the India Street blocks but had no street frontage to hang a board on (the
 * data pass knows frontages on mapped ways only): the frontage lot nearest to it, or null. Names are never invented:
 * a lot without a mapped business keeps a blank fascia.
 */
export function indiaSign(data: ChunkData, p: { x: number; z: number; cat?: string; name: string; b?: number; e?: number; sign?: boolean }): { b: number; e: number; t: number } | null {
  if (p.sign || NOT_A_SHOP.has(p.cat ?? '') || p.name.length > 30) return null;
  if (p.b !== NORTH_BLOCK && !(p.b !== undefined && SOUTH_FRONTS[p.b])) return null;
  let best: { b: number; e: number; t: number } | null = null, bd = 22;
  for (const f of indiaFronts(data)) {
    const j = (f.edge + 1) % (f.ring.length / 2), ax = f.ring[f.edge * 2], az = f.ring[f.edge * 2 + 1], vx = f.ring[j * 2] - ax, vz = f.ring[j * 2 + 1] - az;
    const t = ((p.x - ax) * vx + (p.z - az) * vz) / (vx * vx + vz * vz);
    if (t < 0 || t > 1) continue;
    const d = Math.hypot(ax + vx * t - p.x, az + vz * t - p.z);
    if (d < bd) { bd = d; best = { b: f.b.id, e: f.edge, t }; }
  }
  return best;
}
