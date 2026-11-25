// Streetscape pass: runs after build.ts and annotates the generated chunk files in place.
//
// Buildings named as institutions (which include every custom landmark) are never reclassified.
//
//  1. Heritage shophouse rows. OSM maps the old-town blocks as plain building outlines without
//     levels, lot lines or building type. Buildings that front a curated list of old-town streets
//     are classified as shophouse rows; for each one the wall edges that face a street are stored
//     (`a.f`) so the runtime can generate the five-foot way and per-lot facades on the real
//     outline. Classification, storey count (2) and lot subdivision are ESTIMATES and are flagged
//     as such (`a.c = 1`, height source stays 2 = estimated).
//  2. Street furniture: mapped traffic signals, benches and bollards (OSM nodes); street-name signs
//     at mapped junctions; procedurally spaced lamp posts along named streets (inferred, never
//     inside buildings, water or junction areas); railings along the mapped river bank where a
//     mapped promenade runs beside it.
//     N1-M4: zebra crossings and bus stops at their mapped nodes (data-src/osm/street.json, fetched by
//     tools/extract-map-data/fetch-street.ts), a yellow box on the junction nearest each mapped signal, lamp
//     posts on unnamed streets too; and, inferred by rule, bollards across the mouths of pedestrian streets and
//     generic road signs (speed limit, stop, crossing, bus). No street lamp is mapped in this area.
//
// The pass is idempotent: it recomputes everything from the mapped geometry on every run.
// Usage: node tools/generate-world/build-streetscape.ts
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { CHUNK_SIZE, QUANT, DATA_ROOT } from '../../src/world/config.ts';
import type { ChunkData, BuildingData } from '../../src/world/types.ts';
import { BUILDING_KINDS, ROAD_TYPES, FURN, BOARDS, ARCH_CLASSES, ARCH_BASIS, SHOPFRONT_CLASSES } from '../../src/world/types.ts';
import { ringArea2, edgeOutward, projectOnSegment, pointInRingFlat } from '../../src/world/arch/frontage.ts';
import { geoToWorld } from '../../src/world/GeoProjection.ts';

const DIR = `public/${DATA_ROOT}/chunks`;

/** Old-town streets lined with shophouse rows (curated from local knowledge; see docs/STREETSCAPE.md). */
export const HERITAGE_STREETS = new Set([
  'Jalan Main Bazaar', 'Jalan Gambier', 'Jalan Carpenter', 'Jalan Ewe Hai', 'Upper China Street', 'Jalan China',
  'Jalan Bishopgate', 'Lebuh Wayang', 'Lebuh Temple', 'Jalan India', 'India Street', 'Lorong Kai Joo', 'Jalan Khoo Hun Yeang',
  'Jalan Power', 'Jalan Market', 'Lebuh Jawa', 'Jalan Padungan', 'Jalan Green Hill',
]);
/** Estimated eaves height of a two-storey shophouse (ground floor + fascia 3.9 m, upper floor 3.7 m, parapet). */
const SHOPHOUSE_H = 8.2;

const chunks = new Map<string, ChunkData>();
for (const f of readdirSync(DIR)) {
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as ChunkData;
  chunks.set(`${d.cx}_${d.cz}`, d);
}

// ---- spatial indexes (world metres) ---------------------------------------------------------------
interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; t: number; f: number; name?: string; id: number }
interface Bld { id: number; ring: number[]; minX: number; maxX: number; minZ: number; maxZ: number }
const CELL = 32;
const segGrid = new Map<string, Seg[]>();
const bldGrid = new Map<string, Bld[]>();
const waterGrid = new Map<string, number[][][]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
function addTo<T>(grid: Map<string, T[]>, minX: number, minZ: number, maxX: number, maxZ: number, v: T): void {
  for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++)
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      const k = `${gx},${gz}`;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(v);
    }
}
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const r of d.roads) {
    for (let i = 2; i < r.p.length; i += 2) {
      const s: Seg = { ax: ox + r.p[i - 2] / QUANT, az: oz + r.p[i - 1] / QUANT, bx: ox + r.p[i] / QUANT, bz: oz + r.p[i + 1] / QUANT, hw: r.w / QUANT / 2, t: r.t, f: r.f, name: r.n !== undefined ? d.names[r.n] : undefined, id: r.id };
      addTo(segGrid, Math.min(s.ax, s.bx), Math.min(s.az, s.bz), Math.max(s.ax, s.bx), Math.max(s.az, s.bz), s);
    }
  }
  for (const b of d.buildings) {
    if (BUILDING_KINDS[b.k] === 'roof') continue;
    const ring = b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]); minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]); }
    addTo(bldGrid, minX, minZ, maxX, maxZ, { id: b.id, ring, minX, maxX, minZ, maxZ });
  }
  for (const poly of d.water) {
    const rings = poly.map((r) => r.map((v, i) => (i % 2 ? oz : ox) + v / QUANT));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < rings[0].length; i += 2) { minX = Math.min(minX, rings[0][i]); maxX = Math.max(maxX, rings[0][i]); minZ = Math.min(minZ, rings[0][i + 1]); maxZ = Math.max(maxZ, rings[0][i + 1]); }
    addTo(waterGrid, minX, minZ, maxX, maxZ, rings);
  }
}
function segsNear(x: number, z: number, r: number): Seg[] {
  const out = new Set<Seg>();
  for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++)
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) for (const s of segGrid.get(`${gx},${gz}`) ?? []) out.add(s);
  return [...out];
}
function buildingAt(x: number, z: number, exceptId = NaN): boolean {
  for (const b of bldGrid.get(gk(x, z)) ?? []) {
    if (b.id === exceptId || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (pointInRingFlat(x, z, b.ring)) return true;
  }
  return false;
}
function inWater(x: number, z: number): boolean {
  for (const rings of waterGrid.get(gk(x, z)) ?? []) {
    if (!pointInRingFlat(x, z, rings[0])) continue;
    let hole = false;
    for (let i = 1; i < rings.length; i++) if (pointInRingFlat(x, z, rings[i])) hole = true;
    if (!hole) return true;
  }
  return false;
}
const T = (name: (typeof ROAD_TYPES)[number]) => ROAD_TYPES.indexOf(name);
const STREET_TYPES = new Set([T('trunk'), T('primary'), T('secondary'), T('tertiary'), T('residential'), T('pedestrian')]);
const PROMENADE_TYPES = new Set([T('pedestrian'), T('footway'), T('path'), T('cycleway'), T('pier')]);

// ---- 1. heritage shophouse frontages ----------------------------------------------------------------
const stats = { protectedFromShopfronts: 0, heritageBuildings: 0, frontageEdges: 0, frontageMetres: 0, estimatedUnits: 0, lamps: 0, signals: 0, streetSigns: 0, benches: 0, bollards: 0, railMetres: 0, zebras: 0, boxJunctions: 0, busStops: 0, mouthBollards: 0, boards: 0 };
const OK_KINDS = new Set(['generic', 'commercial', 'shophouse']);
// A named outline is normally an institution or landmark and is left alone. Rows that OSM names
// after one of the businesses inside them (e.g. "328 Gallery Sdn. Bhd.") are still shophouse rows.
const INSTITUTION = /court|tower|museum|muzium|mosque|masjid|temple|church|cathedral|pavilion|complex|kompleks|plaza|hotel|car park|parking|office|pejabat|police|polis|school|sekolah|market|pasar|hospital|klinik|clinic|bank|association|persatuan|hall|dewan|centre|center|mall|house|fort|astana|station|terminal/i;

function frontageEdges(b: BuildingData, ring: number[]): { edges: number[]; heritage: boolean } {
  const n = ring.length / 2;
  const a2 = ringArea2(ring);
  const edges: number[] = [];
  let heritage = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 5) continue;
    const [nx, nz] = edgeOutward(ring, i, a2);
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    let pass = 0, onHeritage = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const sx = ax + (bx - ax) * t, sz = az + (bz - az) * t;
      if (buildingAt(sx + nx * 1.5, sz + nz * 1.5, b.id)) continue; // party wall / another building right in front
      let best: Seg | null = null, bestD = Infinity;
      for (const s of segsNear(sx, sz, 26)) {
        if (!STREET_TYPES.has(s.t) || s.f & 3) continue;
        const [u, dist] = projectOnSegment(sx, sz, s.ax, s.az, s.bx, s.bz);
        if (dist > s.hw + 9 || dist >= bestD) continue;
        const qx = s.ax + (s.bx - s.ax) * u - sx, qz = s.az + (s.bz - s.az) * u - sz;
        if ((qx * nx + qz * nz) / (dist || 1) < 0.8) continue; // the street must lie in front of the wall
        const sl = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
        if (Math.abs(((s.bx - s.ax) * ex + (s.bz - s.az) * ez) / sl) < 0.75) continue; // and run along it
        best = s; bestD = dist;
      }
      if (!best) continue;
      // Nothing may stand between the wall and the street.
      let clear = true;
      for (let k = 1; k <= 3 && clear; k++) if (buildingAt(sx + nx * (bestD * k) / 4, sz + nz * (bestD * k) / 4, b.id)) clear = false;
      if (!clear) continue;
      pass++;
      if (best.name && HERITAGE_STREETS.has(best.name)) onHeritage++;
    }
    if (pass >= 2) {
      edges.push(i);
      if (onHeritage >= 2) heritage = true;
    }
  }
  return { edges, heritage };
}

for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const b of d.buildings) {
    delete b.a;
    // Protected landmark sites and every building whose own tags establish a non-shop form (temple,
    // mosque, museum, market ...) are never turned into shophouse rows, whatever street they face.
    if (b.lm || !SHOPFRONT_CLASSES.has(ARCH_CLASSES[b.ac ?? 0])) { stats.protectedFromShopfronts++; continue; }
    if (b.s || (b.n !== undefined && INSTITUTION.test(d.names[b.n])) || !OK_KINDS.has(BUILDING_KINDS[b.k]) || b.r.length !== 1) continue;
    const ring = b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
    const area = Math.abs(ringArea2(ring)) / 2;
    if (area < 70 || (b.hs !== 2 && b.h > 1300) || ring.length / 2 > 40) continue;
    const { edges, heritage } = frontageEdges(b, ring);
    if (!heritage || !edges.length) continue;
    let levels = 2;
    if (b.hs === 2) b.h = Math.round(SHOPHOUSE_H * QUANT);
    else levels = Math.max(2, Math.min(4, Math.round((b.h / QUANT - 1) / 3.5)));
    b.k = BUILDING_KINDS.indexOf('shophouse');
    b.a = { c: 1, f: edges, lv: levels };
    if ((b.ab ?? 0) < ARCH_BASIS.indexOf('tag')) { b.ac = ARCH_CLASSES.indexOf('heritage_shophouse'); b.ab = ARCH_BASIS.indexOf('inferred'); }
    stats.heritageBuildings++;
    stats.frontageEdges += edges.length;
    for (const i of edges) {
      const j = (i + 1) % (ring.length / 2);
      const len = Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]);
      stats.frontageMetres += len;
      stats.estimatedUnits += Math.max(1, Math.round(len / 5.2));
    }
  }
}

// ---- 2. street furniture ---------------------------------------------------------------------------
function chunkOf(x: number, z: number): ChunkData | undefined {
  return chunks.get(`${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`);
}
function nameIndex(d: ChunkData, name: string): number {
  let i = d.names.indexOf(name);
  if (i < 0) { i = d.names.length; d.names.push(name); }
  return i;
}
function putFurn(type: number, x: number, z: number, rot: number, extra = 0, extraName?: string): boolean {
  const d = chunkOf(x, z);
  if (!d || buildingAt(x, z) || inWater(x, z)) return false;
  const deg = Math.round(((rot * 180) / Math.PI + 3600) % 360);
  (d.furn ??= []).push(type, Math.round((x - d.cx * CHUNK_SIZE) * QUANT), Math.round((z - d.cz * CHUNK_SIZE) * QUANT), deg, extraName !== undefined ? nameIndex(d, extraName) : extra);
  return true;
}
/** True when (x, z) lies on a carriageway other than the road with id `own`. */
function onOtherRoad(x: number, z: number, own: number, pad = 0.4, sameNameToo = false): boolean {
  for (const s of segsNear(x, z, 14)) {
    // sameNameToo: also treat the other carriageway of a dual road (a different way id) as "road".
    void sameNameToo;
    if (s.id === own || !(STREET_TYPES.has(s.t) || s.t === T('service') || s.t === T('motorway'))) continue;
    if (projectOnSegment(x, z, s.ax, s.az, s.bx, s.bz)[1] < s.hw + pad) return true;
  }
  return false;
}
for (const d of chunks.values()) { delete d.furn; delete d.rail; }

// 2a. Lamp posts (inferred): every 32 m on alternating sides of named streets.
const LAMP_TYPES = new Set([T('trunk'), T('primary'), T('secondary'), T('tertiary'), T('residential')]);
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const r of d.roads) {
    if (!LAMP_TYPES.has(r.t) || r.f & 3) continue;
    const hw = r.w / QUANT / 2;
    // N1-M4: the column stands on the footpath of a larger road, and behind the roadside drain of a residential one
    // (src/world/StreetEdges.ts); the larger roads get the tall column.
    const big = r.t !== T('residential'), off = big ? 0.98 : 1.15;
    // Phase from the way id so spacing does not restart visibly at every chunk border.
    let next = 8 + (Math.abs(r.id) % 16), side = Math.abs(r.id) % 2 ? 1 : -1, acc = 0;
    for (let i = 2; i < r.p.length; i += 2) {
      const ax = ox + r.p[i - 2] / QUANT, az = oz + r.p[i - 1] / QUANT, bx = ox + r.p[i] / QUANT, bz = oz + r.p[i + 1] / QUANT;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      while (next <= acc + len) {
        const t = next - acc;
        const x = ax + dx * t - dz * (hw + off) * side, z = az + dz * t + dx * (hw + off) * side;
        // The arm (local +Z) points back over the carriageway. (Until N1-M4 it was turned a quarter too far and lay along the road.)
        if (!onOtherRoad(x, z, r.id, 0.4, true) && putFurn(FURN.lamp, x, z, Math.atan2(dz * side, -dx * side), big ? 1 : 0)) stats.lamps++;
        next += 32;
        side = -side;
      }
      acc += len;
    }
  }
}

// 2b. Mapped nodes: traffic signals, benches, bollards.
if (existsSync('data-src/osm/pois.json')) {
  const els = JSON.parse(readFileSync('data-src/osm/pois.json', 'utf8')).elements as any[];
  for (const e of els) {
    if (e.type !== 'node' || !e.tags) continue;
    const [x, z] = geoToWorld(e.lat, e.lon);
    if (e.tags.highway === 'traffic_signals') {
      // The node sits on the carriageway: stand the pole at the left kerb of the nearest street.
      let best: Seg | null = null, bestD = 12, bu = 0;
      for (const s of segsNear(x, z, 12)) {
        if (!STREET_TYPES.has(s.t)) continue;
        const [u, dist] = projectOnSegment(x, z, s.ax, s.az, s.bx, s.bz);
        if (dist < bestD) { best = s; bestD = dist; bu = u; }
      }
      if (!best) continue;
      const l = Math.hypot(best.bx - best.ax, best.bz - best.az) || 1;
      const dx = (best.bx - best.ax) / l, dz = (best.bz - best.az) / l;
      const cx = best.ax + (best.bx - best.ax) * bu, cz = best.az + (best.bz - best.az) * bu;
      for (const side of [1, -1]) {
        const px = cx + dz * (best.hw + 0.6) * side, pz = cz - dx * (best.hw + 0.6) * side;
        // The lenses (local +Z) face the traffic that keeps left on this side: it moves along +d when side > 0.
        if (putFurn(FURN.signal, px, pz, Math.atan2(dx, dz) + (side > 0 ? Math.PI : 0))) { stats.signals++; break; }
      }
    } else if (e.tags.amenity === 'bench' && !e.tags.name) {
      if (putFurn(FURN.bench, x, z, 0)) stats.benches++;
    } else if (e.tags.barrier === 'bollard') {
      if (putFurn(FURN.bollard, x, z, 0)) stats.bollards++;
    }
  }
}

// 2b'. N1-M4. Junction nodes of the street network (three or more carriageway ends meet, of two or more ways).
const DRIVE_TYPES = new Set([T('trunk'), T('primary'), T('secondary'), T('tertiary'), T('residential')]);
const nodeSegs = new Map<string, Seg[]>();
{
  const seen = new Set<Seg>();
  for (const list of segGrid.values()) for (const s of list) {
    if (seen.has(s) || !DRIVE_TYPES.has(s.t) || s.f & 3) continue;
    seen.add(s);
    for (const [x, z] of [[s.ax, s.az], [s.bx, s.bz]]) {
      const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
      const l = nodeSegs.get(k);
      if (l) l.push(s); else nodeSegs.set(k, [s]);
    }
  }
}
interface Junction { x: number; z: number; segs: Seg[] }
const junctions: Junction[] = [];
for (const [k, segs] of nodeSegs) {
  if (segs.length < 3 || new Set(segs.map((s) => s.id)).size < 2) continue;
  const [x, z] = k.split(',').map((v) => +v / 10);
  junctions.push({ x, z, segs });
}
/** Sign board beside a carriageway of half width `hw`, on the left of traffic moving along (tx, tz) and facing it. */
function putBoard(kind: (typeof BOARDS)[number], cx: number, cz: number, tx: number, tz: number, hw: number, big: boolean): boolean {
  const off = hw + (big ? 0.98 : 1.05);
  const x = cx + tz * off, z = cz - tx * off;
  if (onOtherRoad(x, z, NaN, 0.3) || !putFurn(FURN.board, x, z, Math.atan2(-tx, -tz), BOARDS.indexOf(kind))) return false;
  stats.boards++;
  return true;
}
function nearestStreet(x: number, z: number, reach: number, types: Set<number>): { s: Seg; u: number; dist: number } | null {
  let best: { s: Seg; u: number; dist: number } | null = null;
  for (const s of segsNear(x, z, reach)) {
    if (!types.has(s.t) || s.f & 3) continue;
    const [u, dist] = projectOnSegment(x, z, s.ax, s.az, s.bx, s.bz);
    if (dist < (best?.dist ?? reach)) best = { s, u, dist };
  }
  return best;
}
if (existsSync('data-src/osm/pois.json')) {
  const els = JSON.parse(readFileSync('data-src/osm/pois.json', 'utf8')).elements as any[];
  // Zebra crossings: mapped nodes, laid across the street they sit on, with a crossing sign for each direction.
  for (const e of els) {
    if (e.type !== 'node' || e.tags?.highway !== 'crossing') continue;
    const [x, z] = geoToWorld(e.lat, e.lon);
    // The node lies on the way it crosses: a street further off (the node is on a service road or a path) is not it.
    const hit = nearestStreet(x, z, 3, DRIVE_TYPES);
    if (!hit) continue;
    const s = hit.s, l = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1, dx = (s.bx - s.ax) / l, dz = (s.bz - s.az) / l;
    const cx = s.ax + (s.bx - s.ax) * hit.u, cz = s.az + (s.bz - s.az) * hit.u;
    if (!putFurn(FURN.zebra, cx, cz, Math.atan2(dx, dz), Math.round(s.hw * 2 * QUANT))) continue;
    stats.zebras++;
    const big = s.t !== T('residential');
    putBoard('crossing', cx - dx * 4, cz - dz * 4, dx, dz, s.hw, big);
    if (!(s.f & 8)) putBoard('crossing', cx + dx * 4, cz + dz * 4, -dx, -dz, s.hw, big);
  }
  // Yellow box on the junction nearest each mapped signal (the signal is mapped; the paint is inferred).
  const boxed = new Set<Junction>();
  for (const e of els) {
    if (e.type !== 'node' || e.tags?.highway !== 'traffic_signals') continue;
    const [x, z] = geoToWorld(e.lat, e.lon);
    let best: Junction | null = null, bd = 30;
    for (const j of junctions) { const d = Math.hypot(j.x - x, j.z - z); if (d < bd) { bd = d; best = j; } }
    // One box per junction: a large junction is mapped as several nodes a few metres apart.
    if (!best || [...boxed].some((j) => Math.hypot(j.x - best!.x, j.z - best!.z) < 26)) continue;
    boxed.add(best);
    const main = best.segs.reduce((a, b) => (b.hw > a.hw ? b : a));
    const l = Math.hypot(main.bx - main.ax, main.bz - main.az) || 1, dx = (main.bx - main.ax) / l, dz = (main.bz - main.az) / l;
    // Half length along the main road = the widest road that crosses it; half width = the main road's own.
    let cross = 0;
    for (const s of best.segs) {
      const sl = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      if (Math.abs(((s.bx - s.ax) * dx + (s.bz - s.az) * dz) / sl) < 0.8) cross = Math.max(cross, s.hw);
    }
    if (!cross) continue;
    const a = Math.min(9, Math.max(2.5, cross - 0.3)), b = Math.min(9, Math.max(2.5, main.hw - 0.3));
    if (putFurn(FURN.box, best.x, best.z, Math.atan2(dx, dz), Math.round(a * 10) * 1000 + Math.round(b * 10))) stats.boxJunctions++;
  }
}
// Bus stops: mapped nodes, moved to the kerb of the street they serve; shelter (generic form) facing the road.
if (existsSync('data-src/osm/street.json')) {
  const els = JSON.parse(readFileSync('data-src/osm/street.json', 'utf8')).elements as any[];
  for (const e of els) {
    if (e.type !== 'node') continue;
    const [x, z] = geoToWorld(e.lat, e.lon);
    const hit = nearestStreet(x, z, 25, DRIVE_TYPES);
    if (!hit) continue;
    const s = hit.s, l = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1, dx = (s.bx - s.ax) / l, dz = (s.bz - s.az) / l;
    const cx = s.ax + (s.bx - s.ax) * hit.u, cz = s.az + (s.bz - s.az) * hit.u;
    // Normal toward the mapped node (a node on the centre line goes to the left of the way's direction).
    let nx = x - cx, nz = z - cz;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.5) { nx = dz; nz = -dx; } else { nx /= nl; nz /= nl; }
    const big = s.t !== T('residential'), off = s.hw + (big ? 1.05 : 1.75);
    for (const sgn of [1, -1]) {
      const px = cx + nx * off * sgn, pz = cz + nz * off * sgn;
      if (onOtherRoad(px, pz, s.id, 1.2) || buildingAt(px + nx * 0.8 * sgn, pz + nz * 0.8 * sgn)) continue;
      // Local +Z of the shelter points at the carriageway.
      if (putFurn(FURN.busStop, px, pz, Math.atan2(-nx * sgn, -nz * sgn), big ? 1 : 0)) { stats.busStops++; break; }
    }
  }
}
// Bollards across the mouth of a pedestrian street where it meets a carriageway (inferred).
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const r of d.roads) {
    if (r.t !== T('pedestrian') || r.f & 3 || r.p.length < 4) continue;
    const n = r.p.length / 2;
    for (const end of [0, n - 1]) {
      const px = r.p[end * 2], pz = r.p[end * 2 + 1];
      if (px <= 0 || pz <= 0 || px >= CHUNK_SIZE * QUANT || pz >= CHUNK_SIZE * QUANT) continue; // cut by the chunk border
      const x = ox + px / QUANT, z = oz + pz / QUANT, o = end ? end - 1 : 1;
      let dx = ox + r.p[o * 2] / QUANT - x, dz = oz + r.p[o * 2 + 1] / QUANT - z;
      const l = Math.hypot(dx, dz);
      if (l < 3) continue;
      dx /= l; dz /= l;
      const hit = nearestStreet(x, z, 9, DRIVE_TYPES);
      if (!hit || hit.dist > hit.s.hw + 1) continue;
      const hw = r.w / QUANT / 2, back = hit.s.hw - hit.dist + 1.3, count = Math.max(2, Math.round((hw * 2) / 1.5));
      for (let i = 0; i < count; i++) {
        const lat = -hw + ((i + 0.5) * hw * 2) / count;
        if (putFurn(FURN.bollard, x + dx * back - dz * lat, z + dz * back + dx * lat, 0)) { stats.bollards++; stats.mouthBollards++; }
      }
    }
  }
}
// Speed-limit signs (inferred: the limit follows the road class), one about every 420 m of road and direction.
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const r of d.roads) {
    if (!DRIVE_TYPES.has(r.t) || r.f & 3) continue;
    const kind = r.t === T('residential') ? 'speed30' : r.t <= T('primary') ? 'speed60' : 'speed50';
    const hw = r.w / QUANT / 2, big = r.t !== T('residential'), step = big ? 420 : 560;
    let next = (Math.abs(r.id) * 37) % step, acc = 0, flip = Math.abs(r.id) % 2 === 0;
    for (let i = 2; i < r.p.length; i += 2) {
      const ax = ox + r.p[i - 2] / QUANT, az = oz + r.p[i - 1] / QUANT, bx = ox + r.p[i] / QUANT, bz = oz + r.p[i + 1] / QUANT;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      while (next <= acc + len) {
        const t = next - acc, back = flip && !(r.f & 8);
        putBoard(kind, ax + dx * t, az + dz * t, back ? -dx : dx, back ? -dz : dz, hw, big);
        next += step; flip = !flip;
      }
      acc += len;
    }
  }
}

// 2c. Street-name signs at mapped junctions (names and junction positions are mapped; the exact
// post position beside the carriageway is inferred).
if (existsSync('data-src/osm/kuching.json')) {
  const els = JSON.parse(readFileSync('data-src/osm/kuching.json', 'utf8')).elements as any[];
  const HW = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'pedestrian', 'living_street', 'unclassified', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
  const ways = els.filter((e) => e.type === 'way' && e.tags && HW.has(e.tags.highway) && e.nodes && e.geometry);
  const use = new Map<number, Set<string>>();
  for (const w of ways) for (const nd of w.nodes) {
    let s = use.get(nd);
    if (!s) use.set(nd, (s = new Set()));
    s.add(w.tags.name ?? `#${w.id}`);
  }
  const done = new Set<string>();
  for (const w of ways) {
    const name = w.tags.name;
    if (!name || w.tags.bridge || w.tags.tunnel) continue;
    const pts = w.geometry.map((g: any) => geoToWorld(g.lat, g.lon)) as [number, number][];
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (total < 30) continue;
    for (const end of [0, 1]) {
      const node = w.nodes[end ? w.nodes.length - 1 : 0];
      // A junction with a differently named street.
      if ((use.get(node)?.size ?? 0) < 2 || done.has(`${name}@${node}`)) continue;
      const seq = end ? [...pts].reverse() : pts;
      // Walk 9 m into the street from the junction.
      let left = Math.min(9, total * 0.3), x = seq[0][0], z = seq[0][1], dx = 0, dz = 1;
      for (let i = 1; i < seq.length; i++) {
        const l = Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]);
        if (l < 1e-3) continue;
        dx = (seq[i][0] - seq[i - 1][0]) / l; dz = (seq[i][1] - seq[i - 1][1]) / l;
        if (left <= l) { x = seq[i - 1][0] + dx * left; z = seq[i - 1][1] + dz * left; break; }
        left -= l; x = seq[i][0]; z = seq[i][1];
      }
      let hw = 3;
      for (const s of segsNear(x, z, 6)) if (s.id === w.id) { hw = s.hw; break; }
      for (const side of [1, -1]) {
        const px = x + dz * (hw + 0.8) * side, pz = z - dx * (hw + 0.8) * side;
        if (onOtherRoad(px, pz, w.id)) continue;
        if (putFurn(FURN.sign, px, pz, Math.atan2(dx, dz), 0, name)) { stats.streetSigns++; done.add(`${name}@${node}`); break; }
      }
      // N1-M4: a stop sign where a minor street runs into the junction (inferred; it faces traffic nearing the node).
      const minor = w.tags.highway === 'residential' || w.tags.highway === 'living_street' || w.tags.highway === 'unclassified';
      if (minor && total >= 60 && !(w.tags.oneway === 'yes' && end === 0) && !(w.tags.oneway === '-1' && end === 1)) putBoard('stop', x - dx * 3, z - dz * 3, -dx, -dz, hw, false);
    }
  }
}

// 2d. Railings along the mapped river bank where a mapped promenade / footway runs within 14 m.
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  const rails: number[][] = [];
  for (const line of d.shore) {
    let cur: number[] = [];
    const flush = () => { if (cur.length >= 4) rails.push(cur); cur = []; };
    for (let i = 2; i < line.length; i += 2) {
      const ax = ox + line[i - 2] / QUANT, az = oz + line[i - 1] / QUANT, bx = ox + line[i] / QUANT, bz = oz + line[i + 1] / QUANT;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      let near = false;
      for (const s of segsNear(mx, mz, 16)) {
        if (!PROMENADE_TYPES.has(s.t) || s.f & 1) continue;
        if (projectOnSegment(mx, mz, s.ax, s.az, s.bx, s.bz)[1] < 14) { near = true; break; }
      }
      if (!near) { flush(); continue; }
      if (!cur.length) cur.push(line[i - 2], line[i - 1]);
      cur.push(line[i], line[i + 1]);
      stats.railMetres += Math.hypot(bx - ax, bz - az);
    }
    flush();
  }
  if (rails.length) d.rail = rails;
}

for (const d of chunks.values()) writeFileSync(`${DIR}/${d.cx}_${d.cz}.json`, JSON.stringify(d));
for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = Math.round(stats[k]);
writeFileSync(`public/${DATA_ROOT}/streetscape-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), heritageStreets: [...HERITAGE_STREETS], shophouseHeightM: SHOPHOUSE_H, stats }, null, 2));
console.log('streetscape:', JSON.stringify(stats));
