// Overture Maps building footprints (machine-detected sources only) and their conflation with the
// OpenStreetMap buildings. Shared by build.ts and tools/validate-geography/validate.ts.
//
// Only footprints whose Overture source dataset is "Microsoft ML Buildings" or "Google Open
// Buildings" are read here. Overture features that come from OpenStreetMap are skipped because the
// build takes OSM buildings from the OSM extract directly.
//
// Id scheme: OSM buildings keep their ids (positive way id, negated relation id; today below
// 2^34 in magnitude). An Overture footprint gets
//     id = 2^52 + (first 48 bits of its Overture / GERS UUID)
// which lies in [2^52, 2^52 + 2^48), is exactly representable as a JavaScript number, is always
// positive (so it cannot equal a negated relation id) and is far above any OSM id. The id depends
// only on the feature's own UUID, so it is stable between builds and Overture releases that keep
// the GERS id.
import { existsSync, readFileSync } from 'node:fs';
import polygonClipping from 'polygon-clipping';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
import { cleanRing, ringArea, pointInPoly } from './osm.ts';
import type { Pt } from './osm.ts';

export const OVERTURE_FILE = 'data-src/overture/buildings.geojsonl';
export const OVERTURE_META = 'data-src/overture/buildings.meta.json';
export const OVERTURE_ID_BASE = 2 ** 52;
/** Douglas-Peucker tolerance (metres) applied to machine-detected outlines only, never to OSM. */
export const ML_SIMPLIFY_TOL = 0.3;
/** Machine-detected footprints smaller than this (m2) are dropped. */
export const ML_MIN_AREA = 12;
/** Share of a footprint's area covered by OSM buildings / other ML footprints that makes it a duplicate. */
export const ML_OVERLAP_SHARE = 0.1;
/** Share of a footprint's area on a carriageway or in water above which it is dropped. */
export const ML_ON_ROAD_SHARE = 0.5;
export const ML_IN_WATER_SHARE = 0.5;
/** A mapped way centre line running through a footprint for more than this (metres) drops it. */
export const ML_CENTRELINE_INSIDE = 0.2;

export const SOURCE_NAMES = ['OpenStreetMap', 'Microsoft ML Buildings', 'Google Open Buildings'] as const;
export type Poly = Pt[][];

export interface OvertureFeature {
  uuid: string;
  id: number;
  /** 1 = Microsoft ML Buildings, 2 = Google Open Buildings. */
  src: 1 | 2;
  /** Source geometry in world metres ([outer, ...holes]), cleaned but not simplified. */
  poly: Poly;
  height?: number;
  floors?: number;
  name?: string;
}
export interface OvertureRead {
  features: OvertureFeature[];
  /** Feature counts in the file by source dataset name. */
  bySource: Record<string, number>;
  total: number;
  multiPolygonParts: number;
  idCollisions: number;
  release: string | null;
}

export function overtureId(uuid: string): number {
  return OVERTURE_ID_BASE + parseInt(uuid.replace(/-/g, '').slice(0, 12), 16);
}

/** Overture release of the cached extract, when the fetch tool (or the CLI state file) recorded it. */
export function overtureRelease(): string | null {
  for (const [file, key] of [[OVERTURE_META, 'release'], [`${OVERTURE_FILE}.state`, 'last_release']]) {
    if (!existsSync(file)) continue;
    try {
      const v = JSON.parse(readFileSync(file, 'utf8'))[key];
      if (typeof v === 'string') return v;
    } catch { /* unreadable side file: release stays unknown */ }
  }
  return null;
}

/** Read the cached Overture extract. Returns null when the file does not exist. */
export function readOverture(path = OVERTURE_FILE): OvertureRead | null {
  if (!existsSync(path)) return null;
  const out: OvertureRead = { features: [], bySource: {}, total: 0, multiPolygonParts: 0, idCollisions: 0, release: overtureRelease() };
  const seen = new Set<number>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    const p = f.properties ?? {};
    const ds: string = p.sources?.[0]?.dataset ?? 'unknown';
    out.total++;
    out.bySource[ds] = (out.bySource[ds] ?? 0) + 1;
    const src = ds === SOURCE_NAMES[1] ? 1 : ds === SOURCE_NAMES[2] ? 2 : 0;
    if (!src || !f.geometry || typeof f.id !== 'string') continue;
    let polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    if (polys.length > 1) {
      // One id per feature: keep only the largest part of a multi-part footprint.
      out.multiPolygonParts += polys.length - 1;
      const size = (c: number[][][]) => Math.abs(ringArea(c[0].map(([lon, lat]) => geoToWorld(lat, lon))));
      polys = [polys.reduce((a, b) => (size(b) > size(a) ? b : a))];
    }
    if (!polys.length) continue;
    const poly = polys[0].map((ring) => cleanRing(ring.map(([lon, lat]) => geoToWorld(lat, lon))));
    if (!poly.length) continue;
    const id = overtureId(f.id);
    if (seen.has(id)) { out.idCollisions++; continue; }
    seen.add(id);
    const feat: OvertureFeature = { uuid: f.id, id, src, poly };
    if (typeof p.height === 'number') feat.height = p.height;
    if (typeof p.num_floors === 'number') feat.floors = p.num_floors;
    if (typeof p.names?.primary === 'string') feat.name = p.names.primary;
    out.features.push(feat);
  }
  return out;
}

function distSegPt(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + vx * t - x, az + vz * t - z);
}

/** Douglas-Peucker on a closed ring (no repeated closing vertex). Keeps a subset of the vertices. */
export function simplifyClosedRing(r: Pt[], tol: number): Pt[] {
  const n = r.length;
  if (n <= 4) return r;
  let far = 1, fd = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  const at = (i: number) => r[i % n];
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [a, c] = stack.pop()!;
    let md = 0, mi = -1;
    for (let i = a + 1; i < c; i++) {
      const d = distSegPt(at(i)[0], at(i)[1], at(a)[0], at(a)[1], at(c)[0], at(c)[1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, c]); }
  }
  return r.filter((_, i) => keep[i]);
}

/** Area centroid of a ring (falls back to the vertex mean for degenerate rings). */
export function ringCentroid(r: Pt[]): Pt {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cz += (r[j][1] + r[i][1]) * f;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sz = 0;
    for (const p of r) { sx += p[0]; sz += p[1]; }
    return [sx / r.length, sz / r.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

function bboxOf(r: Pt[]): number[] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}
const closed = (p: Poly) => p.map((r) => [...r, r[0]]);
function polyArea(p: Poly): number {
  let a = Math.abs(ringArea(p[0]));
  for (let i = 1; i < p.length; i++) a -= Math.abs(ringArea(p[i]));
  return a;
}
function intersectionArea(a: Poly, b: Poly): number {
  try {
    const mp = polygonClipping.intersection(closed(a) as any, closed(b) as any) as unknown as Pt[][][];
    let s = 0;
    for (const poly of mp) poly.forEach((ring, i) => { const ar = Math.abs(ringArea(ring.slice(0, -1))); s += i ? -ar : ar; });
    return s;
  } catch {
    return Infinity; // invalid geometry: treat as overlapping
  }
}
/** Length of segment a-b that lies inside the polygon (outer ring only). */
function lengthInside(a: Pt, b: Pt, ring: Pt[]): number {
  const ts = [0, 1];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ex = ring[i][0] - ring[j][0], ez = ring[i][1] - ring[j][1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ring[j][0] - a[0]) * ez - (ring[j][1] - a[1]) * ex) / den;
    const u = ((ring[j][0] - a[0]) * dz - (ring[j][1] - a[1]) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  const len = Math.hypot(dx, dz);
  let inside = 0;
  for (let i = 1; i < ts.length; i++) {
    const m = (ts[i - 1] + ts[i]) / 2;
    if (ts[i] - ts[i - 1] > 1e-9 && pointInPoly(a[0] + dx * m, a[1] + dz * m, [ring])) inside += (ts[i] - ts[i - 1]) * len;
  }
  return inside;
}

class Grid<T> {
  private cells = new Map<string, T[]>();
  private size: number;
  constructor(size: number) { this.size = size; }
  add(bb: number[], item: T): void {
    for (let gz = Math.floor(bb[1] / this.size); gz <= Math.floor(bb[3] / this.size); gz++) for (let gx = Math.floor(bb[0] / this.size); gx <= Math.floor(bb[2] / this.size); gx++) {
      const k = `${gx}_${gz}`;
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(item);
    }
  }
  query(bb: number[]): Set<T> {
    const out = new Set<T>();
    for (let gz = Math.floor(bb[1] / this.size); gz <= Math.floor(bb[3] / this.size); gz++) for (let gx = Math.floor(bb[0] / this.size); gx <= Math.floor(bb[2] / this.size); gx++) {
      const c = this.cells.get(`${gx}_${gz}`);
      if (c) for (const i of c) out.add(i);
    }
    return out;
  }
}

export interface ConflateRoad {
  pts: Pt[];
  /** Carriageway half width in metres; 0 when the way is not a carriageway (foot paths etc.). */
  half: number;
}
export interface KeptFootprint extends OvertureFeature {
  /** Simplified geometry that is emitted. */
  out: Poly;
  area: number;
  bb: number[];
}
export const DROP_REASONS = ['tooSmall', 'degenerate', 'duplicateOfOsm', 'onRoad', 'crossedByMappedWay', 'inWater', 'duplicateOfMl'] as const;
export type DropReason = (typeof DROP_REASONS)[number];
export interface ConflateResult {
  kept: KeptFootprint[];
  dropped: Record<DropReason, number>;
  /** Vertices before / after the 0.3 m simplification, over the kept footprints. */
  vertsIn: number;
  vertsOut: number;
}

/**
 * Decide which machine-detected footprints are added to the world.
 * `osm` are the buildings already taken from OpenStreetMap (never modified or removed here);
 * `roads` are all mapped ways a footprint must not sit on (tunnels / building passages excluded
 * by the caller).
 */
export function conflate(
  features: OvertureFeature[],
  osm: { poly: Poly; bb: number[] }[],
  roads: ConflateRoad[],
  inWater: (x: number, z: number) => boolean,
): ConflateResult {
  const dropped = Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<DropReason, number>;
  const G = 32;
  const osmGrid = new Grid<{ poly: Poly; bb: number[]; c: Pt }>(G);
  for (const b of osm) osmGrid.add(b.bb, { poly: b.poly, bb: b.bb, c: ringCentroid(b.poly[0]) });
  interface Seg { a: Pt; b: Pt; half: number }
  const segGrid = new Grid<Seg>(G);
  for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], h = r.half;
    segGrid.add([Math.min(a[0], b[0]) - h, Math.min(a[1], b[1]) - h, Math.max(a[0], b[0]) + h, Math.max(a[1], b[1]) + h], { a, b, half: h });
  }
  const keptGrid = new Grid<KeptFootprint>(G);
  const kept: KeptFootprint[] = [];
  let vertsIn = 0, vertsOut = 0;
  const overlaps = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

  // Deterministic order: Microsoft before Google (Google outlines carry confidence scores as low
  // as 0.65 in this extract), then by UUID. The first of two overlapping ML footprints is kept.
  const order = features.slice().sort((p, q) => p.src - q.src || (p.uuid < q.uuid ? -1 : p.uuid > q.uuid ? 1 : 0));
  for (const f of order) {
    if (f.poly[0].length < 3) { dropped.degenerate++; continue; }
    if (Math.abs(ringArea(f.poly[0])) < ML_MIN_AREA) { dropped.tooSmall++; continue; }
    const outer = simplifyClosedRing(f.poly[0], ML_SIMPLIFY_TOL);
    const holes = f.poly.slice(1).map((h) => simplifyClosedRing(h, ML_SIMPLIFY_TOL)).filter((h) => h.length >= 3 && Math.abs(ringArea(h)) >= 4);
    const out: Poly = [outer, ...holes];
    const area = polyArea(out);
    if (outer.length < 3 || !(area > 0)) { dropped.degenerate++; continue; }
    if (area < ML_MIN_AREA) { dropped.tooSmall++; continue; }
    const bb = bboxOf(outer);
    const c = ringCentroid(outer);

    // 1. OSM wins wherever both exist.
    let dup = false, shared = 0;
    for (const o of osmGrid.query(bb)) {
      if (!overlaps(bb, o.bb)) continue;
      if (pointInPoly(c[0], c[1], o.poly) || pointInPoly(o.c[0], o.c[1], out)) { dup = true; break; }
      shared += intersectionArea(out, o.poly);
      if (shared > area * ML_OVERLAP_SHARE || shared > polyArea(o.poly) * ML_OVERLAP_SHARE) { dup = true; break; }
    }
    if (dup) { dropped.duplicateOfOsm++; continue; }

    // 2. Mapped ways: a centre line through the footprint, or most of the footprint on a carriageway.
    const segs = [...segGrid.query(bb)];
    let crossed = false;
    for (const s of segs) if (lengthInside(s.a, s.b, outer) > ML_CENTRELINE_INSIDE) { crossed = true; break; }
    if (crossed) { dropped.crossedByMappedWay++; continue; }
    const step = Math.max(0.75, Math.sqrt(area / 200));
    let n = 0, onRoad = 0, wet = 0;
    const lanes = segs.filter((s) => s.half > 0);
    for (let z = bb[1] + step / 2; z < bb[3]; z += step) for (let x = bb[0] + step / 2; x < bb[2]; x += step) {
      if (!pointInPoly(x, z, out)) continue;
      n++;
      if (inWater(x, z)) wet++;
      for (const s of lanes) if (distSegPt(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) < s.half) { onRoad++; break; }
    }
    if (n && onRoad / n > ML_ON_ROAD_SHARE) { dropped.onRoad++; continue; }
    if (n ? wet / n > ML_IN_WATER_SHARE : inWater(c[0], c[1])) { dropped.inWater++; continue; }

    // 3. Machine-detected duplicates of each other.
    dup = false; shared = 0;
    for (const o of keptGrid.query(bb)) {
      if (!overlaps(bb, o.bb)) continue;
      const oc = ringCentroid(o.out[0]);
      if (pointInPoly(c[0], c[1], o.out) || pointInPoly(oc[0], oc[1], out)) { dup = true; break; }
      const ia = intersectionArea(out, o.out);
      shared += ia;
      if (shared > area * ML_OVERLAP_SHARE || ia > o.area * ML_OVERLAP_SHARE) { dup = true; break; }
    }
    if (dup) { dropped.duplicateOfMl++; continue; }

    const k: KeptFootprint = { ...f, out, area, bb };
    kept.push(k);
    keptGrid.add(bb, k);
    vertsIn += f.poly.reduce((s, r) => s + r.length, 0);
    vertsOut += out.reduce((s, r) => s + r.length, 0);
  }
  return { kept, dropped, vertsIn, vertsOut };
}
