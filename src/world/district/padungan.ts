// N1-M5 hero place 5: Jalan Padungan (Kuching's Chinatown) and its cat statues.
// Pure geometry and tables (no three.js): the model builders, the collision world, the tree pass and the unit tests
// all read the same lists.
//
// WHAT IS REAL (OpenStreetMap): the two one-way carriageways of Jalan Padungan and the islands between them; the
// shophouse blocks along it; the "Cat Statue" node 2404396149 on the island at the Jalan Abell junction; the
// "Great Cat of Kuching" node 4332185093 on the island at the east end; the outline of the "Kuching Chinatown
// Paifang" (way 1388131128), which spans both carriageways.
// VERIFIED FORM (Commons photographs, see docs/night/m5-padungan-cat-statue.md):
//  - the statue at the Jalan Abell junction is the CAT COLUMN: a grey column with leaf and hibiscus relief, a gold
//    crown ring and a blue crenellated block with the city council's arms on top, four white cats sitting round its
//    foot on a wide plinth (Medelam, CC BY-SA 4.0; the Everrise store behind it in the photograph is mapped 30 m
//    from the node, which is how the node was identified);
//  - the Great Cat: a large white cat sitting upright with one forepaw raised, on a low plinth in a planted bed in
//    front of the gate; the gate: four salmon piers on dark red bases, a painted beam with a cream "SELAMAT DATANG"
//    panel, dark name panels, and grey-blue tiled roofs with upturned corners over three bays, the two outer bays
//    over the carriageways (Stefan Krasowski, CC BY 2.0);
//  - shophouses of two to three storeys in strong colours (crimson, yellow, cream, teal) with painted timber fascia
//    boards and air-conditioner units (Esther Siaw, CC BY 4.0; StormChase, CC BY-SA 3.0).
// APPROXIMATE: every dimension; the pier positions (derived from where the mapped carriageways cross the mapped
// outline); which way each statue faces; the paint, fascia board and air-conditioner of every single lot (no
// photograph shows a whole row, and the 1928 house of the photograph is not located); the kapcai at the kerb.
// NOT REPRODUCED: the Chinese inscriptions of the gate and the wording on the column's crown.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { BuildingData, ChunkData } from '../types.ts';
import { ROAD_STYLE, ROAD_TYPES } from '../types.ts';
import { edgeOutward, hash3, unitsAlong } from '../arch/frontage.ts';
import { onRoadsFlagChange, roadWidthCm } from '../roadsFlag.ts';
import { m5Enabled } from './m5.ts';

/** OSM node 2404396149 ("Cat Statue"), world metres: the Cat Column. Same point as `cat-statue` in landmarks.json. */
export const CAT_COLUMN = { x: 1104.13, z: 243.7, key: '4_0' };
/** OSM node 4332185093 ("Great Cat of Kuching"), 1.553516 N 110.358690 E, world metres. */
export const GREAT_CAT = { x: 1579.05, z: 551.1, key: '6_2' };
export const PAIFANG_ID = 1388131128;
export const PAIFANG_KEY = '6_2';
/** Column: plinth radius and height, shaft radius, total height above the ground (all estimated from one photograph). */
export const COLUMN = { plinthR: 2.3, plinthH: 0.55, shaftR: 0.46, height: 8.2, cats: 4, catH: 1.05 };
/** Great Cat: height of the cat above its plinth, plinth half size and height, radius of the planted bed. */
export const CAT = { height: 2.5, plinth: 1.1, plinthH: 0.4, bed: 5.2 };
/** Gate: pier side, clear height under the beam, clearance kept between a pier and the edge of a carriageway. */
export const GATE = { pier: 1.3, clear: 5.4, margin: 0.5, top: 11.9 };

/**
 * Frontage edges of the mapped shophouse blocks that face Jalan Padungan between the Cat Column and the paifang
 * (edge i runs from ring vertex i to i + 1). 22 blocks, 197 lots, 992 m of frontage in chunks 4_0, 4_1, 5_1 and 5_2;
 * tests/unit/m5-padungan.test.ts recomputes the table from the chunk data.
 */
export const PADUNGAN_FRONTS: Record<number, number[]> = {
  235473998: [1], 236497918: [0, 1], 236497931: [1, 2, 3], 236513913: [7, 8], 236514181: [3], 236514214: [3], 236514217: [3, 4],
  236515222: [3], 236515297: [4], 236525479: [3], 236525480: [3], 236525824: [3], 236525825: [1, 2], 236525826: [3], 236525827: [1],
  236525828: [3], 236525829: [1], 236525830: [3], 236525831: [1], 236525832: [3], 236942038: [1, 2], 236942039: [1],
};
export const PADUNGAN_KEYS = ['4_0', '4_1', '5_1', '5_2'];

export function padunganFront(id: number, edge: number): boolean {
  return m5Enabled() && !!PADUNGAN_FRONTS[id]?.includes(edge);
}

// Strong paint, as photographed: crimson, yellow, cream, teal, red, white.
const WALLS = [0xa82a40, 0xefc02f, 0xf2e2b4, 0x2aa598, 0xc4483a, 0xf5efe2, 0xf3d476, 0xe9a23b, 0xf2e2b4, 0xf7ecc8, 0xefc02f, 0x8fc9c0];
/** Paint, blind and air-conditioner of one Padungan lot (replaces the generic rule of arch/Shophouse.ts). */
export function padunganLotStyle(id: number, edge: number, unit: number): { wall: number; blind: number; ac: boolean } | null {
  if (!padunganFront(id, edge)) return null;
  let u = unit;
  while (u > 0 && hash3(id, edge * 23 + 11, u) % 100 < 22) u--; // now and then two lots under one coat of paint
  const h = hash3(id, edge * 19 + 3, unit);
  return { wall: WALLS[hash3(id, edge * 19 + 3, u) % WALLS.length], blind: -1, ac: (h >>> 14) % 10 < 7 };
}

const BOARDS = [0x1f8f86, 0x2f7d4f, 0x1f5f9a, 0x8a1f2d];
/** Painted timber fascia board of a lot (colour, gold trim), or null: about half the lots carry one. */
export function padunganBoard(id: number, edge: number, unit: number): { colour: number; awning: boolean } | null {
  if (!padunganFront(id, edge)) return null;
  const h = hash3(id, edge * 41 + 9, unit);
  if (h % 100 >= 52) return null;
  return { colour: BOARDS[(h >>> 8) % BOARDS.length], awning: (h >>> 12) % 5 === 0 };
}

const world = (data: ChunkData, p: number[]): number[] => p.map((v, i) => (i % 2 ? data.cz : data.cx) * CHUNK_SIZE + v / QUANT);
const segDist = (p: number[], x: number, z: number): number => {
  let best = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const vx = p[i] - p[i - 2], vz = p[i + 1] - p[i - 1], t = Math.max(0, Math.min(1, ((x - p[i - 2]) * vx + (z - p[i - 1]) * vz) / (vx * vx + vz * vz || 1)));
    best = Math.min(best, Math.hypot(p[i - 2] + vx * t - x, p[i - 1] + vz * t - z));
  }
  return best;
};
const carriageways = (data: ChunkData): { p: number[]; hw: number }[] =>
  data.roads.filter((r) => ROAD_STYLE[ROAD_TYPES[r.t]].group >= 2).map((r) => ({ p: world(data, r.p), hw: roadWidthCm(r) / QUANT / 2 }));

export interface Front { b: BuildingData; edge: number; ring: number[]; lots: number }
/** The Padungan frontages of this chunk: world ring of the block, edge, lot count. */
export function padunganFronts(data: ChunkData): Front[] {
  if (!m5Enabled() || !PADUNGAN_KEYS.includes(`${data.cx}_${data.cz}`)) return [];
  const out: Front[] = [];
  for (const b of data.buildings) for (const edge of PADUNGAN_FRONTS[b.id] ?? []) {
    if (!b.a?.f.includes(edge)) continue;
    const ring = world(data, b.r[0]), j = (edge + 1) % (ring.length / 2);
    out.push({ b, edge, ring, lots: unitsAlong(Math.hypot(ring[j * 2] - ring[edge * 2], ring[j * 2 + 1] - ring[edge * 2 + 1])).n });
  }
  return out;
}

export interface Bikes { x: number; z: number; tx: number; tz: number; h: number }
const bikeCache = new Map<string, Bikes[]>();
/**
 * Kapcai parked nose to the shops, three at a time, on the strip between the footpath and the five-foot way.
 * Approximate: typical street life placed by rule, and only where the mapped frontage stands far enough back from
 * the mapped carriageway (the carriageways are mapped 6 m wide: there is no room for a kerbside row of cars).
 */
export function padunganBikes(data: ChunkData): Bikes[] {
  const key = `${data.cx}_${data.cz}`;
  if (!m5Enabled() || !PADUNGAN_KEYS.includes(key)) return [];
  const hit = bikeCache.get(key);
  if (hit) return hit;
  const roads = carriageways(data), out: Bikes[] = [];
  for (const f of padunganFronts(data)) {
    const n = f.ring.length / 2, j = (f.edge + 1) % n, ax = f.ring[f.edge * 2], az = f.ring[f.edge * 2 + 1];
    const len = Math.hypot(f.ring[j * 2] - ax, f.ring[j * 2 + 1] - az), ex = (f.ring[j * 2] - ax) / len, ez = (f.ring[j * 2 + 1] - az) / len;
    const [nx, nz] = edgeOutward(f.ring, f.edge);
    for (let u = 0; u < f.lots; u++) {
      const h = hash3(f.b.id, f.edge * 53 + 1, u);
      if (h % 100 >= 22) continue;
      const s = ((u + 0.5) * len) / f.lots, x = ax + ex * s + nx * 1.15, z = az + ez * s + nz * 1.15;
      // the bikes (1.8 m long) must stand clear of every carriageway, and a carriageway must be near (a frontage
      // whose road lies in the next chunk gets none)
      let near = Infinity, clear = true;
      for (const r of roads) { const d = segDist(r.p, x, z); near = Math.min(near, d); if (d < r.hw + 1.45) clear = false; }
      if (!clear || near > 14) continue;
      out.push({ x, z, tx: ex, tz: ez, h });
    }
  }
  bikeCache.set(key, out);
  return out;
}

export interface Paifang {
  /** North end of the gate's axis (world metres), unit vector along it, its length. */
  x: number; z: number; ux: number; uz: number; len: number;
  /** Middle of each of the four piers, metres along the axis. */
  piers: number[];
  /** Unit vector from the gate towards the Great Cat (the photographed face). */
  fx: number; fz: number;
}
let gate: Paifang | null = null;
onRoadsFlagChange(() => { bikeCache.clear(); gate = null; });
/**
 * The gate's frame from the mapped outline, and its four piers from where the two mapped carriageways cross it: one
 * pier outside each carriageway, two on the island between them.
 */
export function paifang(data: ChunkData): Paifang | null {
  if (!m5Enabled() || `${data.cx}_${data.cz}` !== PAIFANG_KEY) return null;
  if (gate) return gate;
  const b = data.buildings.find((q) => q.id === PAIFANG_ID);
  if (!b) return null;
  const r = world(data, b.r[0]), n = r.length / 2;
  // the axis joins the middles of the two shortest edges
  const edges = Array.from({ length: n }, (_, i) => { const j = (i + 1) % n; return { l: Math.hypot(r[j * 2] - r[i * 2], r[j * 2 + 1] - r[i * 2 + 1]), x: (r[i * 2] + r[j * 2]) / 2, z: (r[i * 2 + 1] + r[j * 2 + 1]) / 2 }; });
  const [e0, e1] = [...edges].sort((p, q) => p.l - q.l);
  const [a, c] = e0.z < e1.z ? [e0, e1] : [e1, e0];
  const len = Math.hypot(c.x - a.x, c.z - a.z), ux = (c.x - a.x) / len, uz = (c.z - a.z) / len;
  const cross: { s: number; h: number }[] = [];
  for (const road of carriageways(data)) for (let i = 2; i < road.p.length; i += 2) {
    const px = road.p[i - 2], pz = road.p[i - 1], dx = road.p[i] - px, dz = road.p[i + 1] - pz, den = ux * dz - uz * dx;
    if (Math.abs(den) < 1e-6) continue;
    const s = ((px - a.x) * dz - (pz - a.z) * dx) / den, t = ((px - a.x) * uz - (pz - a.z) * ux) / den;
    if (t < 0 || t > 1 || s < -3 || s > len + 3) continue;
    cross.push({ s, h: road.hw / (Math.abs(den) / Math.hypot(dx, dz)) });
  }
  cross.sort((p, q) => p.s - q.s);
  const g = GATE.margin + GATE.pier / 2;
  const piers = cross.length === 2
    ? [cross[0].s - cross[0].h - g, cross[0].s + cross[0].h + g, cross[1].s - cross[1].h - g, cross[1].s + cross[1].h + g]
    : [0.05 * len, 0.36 * len, 0.64 * len, 0.95 * len];
  const mx = a.x + ux * len / 2, mz = a.z + uz * len / 2, side = Math.sign((GREAT_CAT.x - mx) * -uz + (GREAT_CAT.z - mz) * ux) || 1;
  return (gate = { x: a.x, z: a.z, ux, uz, len, piers, fx: -uz * side, fz: ux * side });
}

/** The lintel text of the gate's photographed face ("SELAMAT DATANG" is legible in the photograph). */
export function paifangSign(data: ChunkData): { text: string; x: number; z: number; up: number; ex: number; ez: number; nx: number; nz: number; maxW: number; h: number } | null {
  const p = paifang(data);
  if (!p) return null;
  const s = (p.piers[1] + p.piers[2]) / 2, o = 0.5;
  // reading direction: left to right for someone facing the gate from the Great Cat's side
  return { text: 'SELAMAT DATANG', x: p.x + p.ux * s + p.fx * o, z: p.z + p.uz * s + p.fz * o, up: GATE.clear + 0.45, ex: p.fz, ez: -p.fx, nx: p.fx, nz: p.fz, maxW: p.piers[2] - p.piers[1] - GATE.pier - 0.3, h: 0.5 };
}

export interface Obstacle { ring: number[]; h: number }
const square = (x: number, z: number, tx: number, tz: number, ha: number, hb: number): number[] => {
  const r: number[] = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(x + tx * ha * a - tz * hb * b, z + tz * ha * a + tx * hb * b);
  return r;
};
/** What blocks a walker and a car: the column's plinth, the Great Cat's plinth, the gate's four piers, the kapcai. */
export function padunganObstacles(data: ChunkData): Obstacle[] {
  if (!m5Enabled()) return [];
  const key = `${data.cx}_${data.cz}`, out: Obstacle[] = [];
  if (key === CAT_COLUMN.key) out.push({ ring: square(CAT_COLUMN.x, CAT_COLUMN.z, 1, 0, COLUMN.plinthR * 0.9, COLUMN.plinthR * 0.9), h: COLUMN.height });
  if (key === GREAT_CAT.key) out.push({ ring: square(GREAT_CAT.x, GREAT_CAT.z, 1, 0, CAT.plinth, CAT.plinth), h: CAT.height });
  const p = paifang(data);
  if (p) for (const s of p.piers) out.push({ ring: square(p.x + p.ux * s, p.z + p.uz * s, p.ux, p.uz, GATE.pier / 2 + 0.15, GATE.pier / 2 + 0.15), h: GATE.clear });
  for (const k of padunganBikes(data)) out.push({ ring: square(k.x, k.z, k.tx, k.tz, 1.5, 0.95), h: 1.1 });
  return out;
}

/** The gate is open: its mapped outline (drawn and blocked as a solid block until now) is not a wall. */
export function isOpenGate(id: number): boolean { return m5Enabled() && id === PAIFANG_ID; }

/** No inferred tree stands on a statue or in front of it (world metres). */
export function statueKeepOut(x: number, z: number): boolean {
  if (!m5Enabled()) return false;
  return Math.hypot(x - CAT_COLUMN.x, z - CAT_COLUMN.z) < 9 || Math.hypot(x - GREAT_CAT.x, z - GREAT_CAT.z) < CAT.bed + 9;
}
