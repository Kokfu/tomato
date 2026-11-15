// Shop identity build: turns the cached open POI extracts into per-chunk place files with a
// validated building association (see docs/SHOP_IDENTITY.md).
//
// Sources, in order of trust:
//   1. data/places-overrides.json   manual corrections by the project owner (v = 2)
//   2. data-src/osm/pois.json       OpenStreetMap named shops / amenities / tourism (v = 1, ODbL)
//   3. data-src/overture/places.geojsonl  Overture Maps Places (v = 0, optional; unverified, so
//      they are inspectable but never get a facade sign and are dropped when OSM has the same place)
// No Google data is used anywhere. Run after build-streetscape.ts (it needs the frontage edges).
// Usage: node tools/generate-world/build-places.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { CHUNK_SIZE, QUANT, DATA_ROOT, DATA_BBOX } from '../../src/world/config.ts';
import type { ChunkData } from '../../src/world/types.ts';
import { BUILDING_KINDS, ROAD_TYPES } from '../../src/world/types.ts';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
import { edgeOutward, projectOnSegment } from '../../src/world/arch/frontage.ts';
import { associate, normName } from '../../src/world/places/associate.ts';
import type { CandidateBuilding } from '../../src/world/places/associate.ts';
import { isSignCategory } from '../../src/world/places/types.ts';
import type { Place, PlaceOverrides } from '../../src/world/places/types.ts';

const ROOT = `public/${DATA_ROOT}`;
const OUT = `${ROOT}/places`;
const OVERTURE_MIN_CONFIDENCE = 0.75;

// ---- world indexes ---------------------------------------------------------------------------------
interface Bld extends CandidateBuilding { minX: number; maxX: number; minZ: number; maxZ: number; key: string }
interface Seg { ax: number; az: number; bx: number; bz: number; hw: number }
const CELL = 32;
const bldGrid = new Map<string, Bld[]>();
const segGrid = new Map<string, Seg[]>();
const chunkKeys = new Set<string>();
const STREET = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'pedestrian', 'service'].map((t) => ROAD_TYPES.indexOf(t as any)));
function add<T>(grid: Map<string, T[]>, minX: number, minZ: number, maxX: number, maxZ: number, v: T): void {
  for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++)
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      const k = `${gx},${gz}`;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(v);
    }
}
for (const f of readdirSync(`${ROOT}/chunks`)) {
  const d = JSON.parse(readFileSync(`${ROOT}/chunks/${f}`, 'utf8')) as ChunkData;
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE, key = `${d.cx}_${d.cz}`;
  chunkKeys.add(key);
  for (const b of d.buildings) {
    if (BUILDING_KINDS[b.k] === 'roof' || b.s) continue; // only human-mapped footprints can carry a business
    const ring = b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]); minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]); }
    add(bldGrid, minX - 6, minZ - 6, maxX + 6, maxZ + 6, { id: b.id, ring, front: b.a?.f, minX, maxX, minZ, maxZ, key });
  }
  for (const r of d.roads) {
    if (!STREET.has(r.t)) continue;
    for (let i = 2; i < r.p.length; i += 2) {
      const s = { ax: ox + r.p[i - 2] / QUANT, az: oz + r.p[i - 1] / QUANT, bx: ox + r.p[i] / QUANT, bz: oz + r.p[i + 1] / QUANT, hw: r.w / QUANT / 2 };
      add(segGrid, Math.min(s.ax, s.bx) - 24, Math.min(s.az, s.bz) - 24, Math.max(s.ax, s.bx) + 24, Math.max(s.az, s.bz) + 24, s);
    }
  }
}
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/** A wall edge may carry a sign only if a street lies in front of it (within 20 m, on the outside). */
function streetFacing(b: CandidateBuilding, e: number): boolean {
  if (b.front?.length) return b.front.includes(e);
  const r = b.ring, n = r.length / 2, j = (e + 1) % n;
  const mx = (r[e * 2] + r[j * 2]) / 2, mz = (r[e * 2 + 1] + r[j * 2 + 1]) / 2;
  const [nx, nz] = edgeOutward(r, e);
  for (const s of segGrid.get(gk(mx, mz)) ?? []) {
    const [u, d] = projectOnSegment(mx, mz, s.ax, s.az, s.bx, s.bz);
    if (d > s.hw + 18) continue;
    const qx = s.ax + (s.bx - s.ax) * u - mx, qz = s.az + (s.bz - s.az) * u - mz;
    if ((qx * nx + qz * nz) / (d || 1) > 0.6) return true;
  }
  return false;
}

// ---- collect places --------------------------------------------------------------------------------
const places = new Map<string, Place>();
const stats: Record<string, number> = { osm: 0, overture: 0, overtureDroppedLowConfidence: 0, overtureDroppedDuplicateOfOsm: 0, manual: 0, removedByOverride: 0, associatedInside: 0, associatedAdjacent: 0, unassociated: 0, signs: 0 };
const inBbox = (lat: number, lon: number) => lat >= DATA_BBOX.south && lat <= DATA_BBOX.north && lon >= DATA_BBOX.west && lon <= DATA_BBOX.east;
const round = (v: number, d: number) => +v.toFixed(d);

const KEYS = ['shop', 'amenity', 'tourism', 'office', 'craft', 'leisure', 'healthcare'];
const signable = new Set<string>();
if (existsSync('data-src/osm/pois.json')) {
  for (const e of JSON.parse(readFileSync('data-src/osm/pois.json', 'utf8')).elements as any[]) {
    const t = e.tags;
    if (!t?.name) continue;
    const key = KEYS.find((k) => t[k]);
    if (!key) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat === undefined || !inBbox(lat, lon)) continue;
    const [x, z] = geoToWorld(lat, lon);
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined;
    const id = `osm:${e.type}/${e.id}`;
    places.set(id, { id, name: t.name, cat: t[key] === 'yes' ? key : t[key], lat: round(lat, 7), lon: round(lon, 7), x: round(x, 2), z: round(z, 2), addr, src: 'osm', upd: e.timestamp?.slice(0, 10), v: 1 });
    if (isSignCategory(key, t[key])) signable.add(id);
    stats.osm++;
  }
}

if (existsSync('data-src/overture/places.geojsonl')) {
  // Spatial hash of OSM names to drop the same business reported by Overture.
  const osmNames = new Map<string, { n: string; x: number; z: number }[]>();
  for (const p of places.values()) add(osmNames, p.x - 80, p.z - 80, p.x + 80, p.z + 80, { n: normName(p.name), x: p.x, z: p.z });
  for (const line of readFileSync('data-src/overture/places.geojsonl', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    const pr = f.properties ?? {};
    const name = pr.names?.primary;
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!name || lat === undefined || !inBbox(lat, lon)) continue;
    if ((pr.confidence ?? 0) < OVERTURE_MIN_CONFIDENCE) { stats.overtureDroppedLowConfidence++; continue; }
    const [x, z] = geoToWorld(lat, lon);
    const nn = normName(name);
    if ((osmNames.get(gk(x, z)) ?? []).some((o) => o.n === nn || (nn.length > 4 && (o.n.includes(nn) || nn.includes(o.n)) && o.n.length > 4))) { stats.overtureDroppedDuplicateOfOsm++; continue; }
    const id = `overture:${f.id ?? pr.id}`;
    const upd = (pr.sources ?? []).map((s: any) => s.update_time).filter(Boolean).sort().pop()?.slice(0, 10);
    places.set(id, { id, name, cat: pr.categories?.primary ?? pr.basic_category ?? 'place', lat: round(lat, 7), lon: round(lon, 7), x: round(x, 2), z: round(z, 2), addr: pr.addresses?.[0]?.freeform ?? undefined, src: 'overture', upd, v: 0, conf: round(pr.confidence, 2) });
    stats.overture++;
  }
}

const OVERRIDES = 'data/places-overrides.json';
if (existsSync(OVERRIDES)) {
  const o = JSON.parse(readFileSync(OVERRIDES, 'utf8')) as PlaceOverrides;
  for (const id of o.remove ?? []) if (places.delete(id)) stats.removedByOverride++;
  for (const u of o.upsert ?? []) {
    const base = places.get(u.id);
    const merged = { ...(base ?? { src: 'manual', cat: 'shop' }), ...u, v: 2 } as Place;
    if (!merged.name || merged.lat === undefined || merged.lon === undefined) { console.warn(`override ${u.id}: name, lat and lon are required - skipped`); continue; }
    const [x, z] = geoToWorld(merged.lat, merged.lon);
    merged.x = round(x, 2); merged.z = round(z, 2);
    delete merged.b; delete merged.how; delete merged.e; delete merged.t; delete merged.sign;
    places.set(u.id, merged);
    signable.add(u.id); // a manually verified place is entitled to a sign
    stats.manual++;
  }
}

// ---- associate and write ---------------------------------------------------------------------------
const byChunk = new Map<string, Place[]>();
const bldChunk = new Map<number, string>();
for (const list of bldGrid.values()) for (const b of list) bldChunk.set(b.id, b.key);
// One sign per (building, edge, lot): the most trustworthy, then most recently updated place wins.
const ordered = [...places.values()].sort((a, b) => b.v - a.v || (b.upd ?? '').localeCompare(a.upd ?? '') || a.id.localeCompare(b.id));
const taken = new Map<string, number>();
for (const p of ordered) {
  const near = [...new Set(bldGrid.get(gk(p.x, p.z)) ?? [])];
  const a = associate(p.x, p.z, near, streetFacing);
  let key = `${Math.floor(p.x / CHUNK_SIZE)}_${Math.floor(p.z / CHUNK_SIZE)}`;
  if (a) {
    Object.assign(p, a);
    key = bldChunk.get(a.b) ?? key;
    if (a.how === 'inside') stats.associatedInside++; else stats.associatedAdjacent++;
    if (a.e !== undefined && signable.has(p.id) && p.v >= 1) {
      // One sign per ~4 m stretch of wall; further businesses there stay inspect-only.
      const slot = `${a.b}:${a.e}:${Math.floor((a.t ?? 0) * 200)}`;
      const lot = `${a.b}:${a.e}:${Math.round(((a.t ?? 0) * 1000) / 40)}`;
      const n = taken.get(lot) ?? 0;
      if (n < 1) { p.sign = true; taken.set(lot, n + 1); stats.signs++; }
      void slot;
    }
  } else stats.unassociated++;
  if (!chunkKeys.has(key)) continue;
  let list = byChunk.get(key);
  if (!list) byChunk.set(key, (list = []));
  list.push(p);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [key, list] of byChunk) {
  list.sort((a, b) => a.id.localeCompare(b.id));
  const s = JSON.stringify({ v: 1, places: list });
  bytes += s.length;
  writeFileSync(`${OUT}/${key}.json`, s);
}
const meta = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const overtureState = meta('data-src/overture/places.geojsonl.state');
writeFileSync(`${OUT}/index.json`, JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  chunks: [...byChunk.keys()].sort(),
  sources: {
    osm: { license: 'ODbL 1.0, (c) OpenStreetMap contributors', osmBaseTimestamp: meta('data-src/osm/pois.meta.json')?.osmBaseTimestamp ?? null },
    overture: existsSync('data-src/overture/places.geojsonl') ? { license: 'CDLA-Permissive-2.0 and others, see docs.overturemaps.org/attribution', release: overtureState?.last_release ?? null, minConfidence: OVERTURE_MIN_CONFIDENCE } : null,
    manual: existsSync(OVERRIDES) ? { file: OVERRIDES } : null,
  },
  rules: { adjacentMaxM: 4, ambiguityMarginM: 2, signMaxDepthM: 16, signsRequireVerification: 1 },
  stats: { ...stats, total: places.size, files: byChunk.size, bytes },
}, null, 2));
console.log('places:', JSON.stringify({ ...stats, total: places.size, files: byChunk.size, bytes }));
