// Shared helpers for reading the cached OSM extract and turning it into projected geometry.
import { applyRoadAlignments } from './road-alignments.ts';
import type { AlignmentResult } from './road-alignments.ts';
import { existsSync, readFileSync } from 'node:fs';
import { geoToWorld } from '../../src/world/GeoProjection.ts';
import type { RoadType } from '../../src/world/types.ts';
import { ROAD_STYLE } from '../../src/world/types.ts';

export type Pt = [number, number];
export interface LatLon { lat: number; lon: number }
export interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: LatLon[];
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[];
}

/** What the last loadOsm() call re-aligned (for the build report). */
export let roadAlignments: AlignmentResult[] = [];
/** Local way tag overrides from `data-src/overrides/roads.json` (keyed by OSM way id). */
export let wayOverrides = new Map<number, Record<string, string>>();

export function loadRoadOverrides(path = 'data-src/overrides/roads.json'): Map<number, Record<string, string>> {
  const map = new Map<number, Record<string, string>>();
  if (!existsSync(path)) return map;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    ways?: { id?: number; ids?: number[]; tags: Record<string, string> }[];
  };
  for (const entry of raw.ways ?? []) {
    const ids = entry.ids ?? (entry.id !== undefined ? [entry.id] : []);
    for (const id of ids) map.set(id, { ...(map.get(id) ?? {}), ...entry.tags });
  }
  return map;
}

export function loadOsm(path = 'data-src/osm/kuching.json'): { elements: OsmEl[]; timestamp: string | null } {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  wayOverrides = loadRoadOverrides();
  // Apply non-width metadata overrides (e.g. missing bridge name/structure) directly so landmark matching sees them;
  // lane/width overrides are consulted via `overriddenTags()` for `?roads=1` (`r.rw`) so `?roads=0` keeps Night 1 widths.
  for (const el of json.elements as OsmEl[]) {
    if (el.type !== 'way' || !el.tags) continue;
    const ov = wayOverrides.get(el.id);
    if (!ov) continue;
    if (ov.name && !el.tags.name) el.tags.name = ov.name;
    if (ov['bridge:structure'] && !el.tags['bridge:structure']) el.tags['bridge:structure'] = ov['bridge:structure'];
  }
  // Derived local corrections of street centre lines (see road-alignments.ts); junction nodes stay put.
  roadAlignments = applyRoadAlignments(json.elements);
  return { elements: json.elements, timestamp: json.osm3s?.timestamp_osm_base ?? null };
}

export function overriddenTags(id: number, tags: Record<string, string>): Record<string, string> {
  const ov = wayOverrides.get(id);
  return ov ? { ...tags, ...ov } : tags;
}

/** Project a lat/lon list to world [x, z] metres. */
export function project(geom: LatLon[]): Pt[] {
  const out: Pt[] = [];
  for (const g of geom) {
    if (!g) continue;
    out.push(geoToWorld(g.lat, g.lon));
  }
  return out;
}

export function isClosedWay(el: OsmEl): boolean {
  return !!el.nodes && el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1];
}

/** Drop the duplicated closing vertex and consecutive duplicates. */
export function cleanRing(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-4 || Math.abs(q[1] - p[1]) > 1e-4) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) out.pop();
  }
  return out;
}

export function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

export function pointInRing(x: number, z: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPoly(x: number, z: number, poly: Pt[][]): boolean {
  if (!pointInRing(x, z, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(x, z, poly[i])) return false;
  return true;
}

/** Stitch relation member ways into closed rings. */
function stitch(parts: LatLon[][]): LatLon[][] {
  const key = (p: LatLon) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const rings: LatLon[][] = [];
  const open = parts.filter((p) => p && p.length > 1).map((p) => p.slice());
  while (open.length) {
    let cur = open.pop()!;
    let guard = 0;
    while (key(cur[0]) !== key(cur[cur.length - 1]) && guard++ < 10000) {
      const end = key(cur[cur.length - 1]);
      const i = open.findIndex((p) => key(p[0]) === end || key(p[p.length - 1]) === end);
      if (i < 0) break;
      let nxt = open.splice(i, 1)[0];
      if (key(nxt[0]) !== end) nxt = nxt.reverse();
      cur = cur.concat(nxt.slice(1));
    }
    if (cur.length >= 4 && key(cur[0]) === key(cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

/** Polygons ([outer, ...holes], world metres) of a closed way or multipolygon relation. */
export function polygonsOf(el: OsmEl): Pt[][][] {
  if (el.type === 'way') {
    if (!el.geometry || !isClosedWay(el)) return [];
    const r = cleanRing(project(el.geometry));
    return r.length >= 3 ? [[r]] : [];
  }
  if (el.type === 'relation' && el.members) {
    const outers = stitch(el.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry!));
    const inners = stitch(el.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry!));
    const polys = outers.map((o) => [cleanRing(project(o))]).filter((p) => p[0].length >= 3);
    for (const inner of inners) {
      const r = cleanRing(project(inner));
      if (r.length < 3) continue;
      const host = polys.find((p) => pointInRing(r[0][0], r[0][1], p[0]));
      if (host) host.push(r);
    }
    return polys;
  }
  return [];
}

const HIGHWAY_MAP: Record<string, RoadType> = {
  motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk',
  primary: 'primary', primary_link: 'primary', secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary', unclassified: 'residential', residential: 'residential',
  living_street: 'residential', road: 'residential', service: 'service', pedestrian: 'pedestrian',
  footway: 'footway', corridor: 'footway', path: 'path', bridleway: 'path', steps: 'steps',
  cycleway: 'cycleway', track: 'track',
};

export function roadTypeOf(tags: Record<string, string>): RoadType | null {
  return HIGHWAY_MAP[tags.highway] ?? null;
}

export function isBridge(tags: Record<string, string>): boolean {
  return !!tags.bridge && tags.bridge !== 'no';
}
export function isTunnel(tags: Record<string, string>): boolean {
  return (!!tags.tunnel && tags.tunnel !== 'no') || tags.covered === 'yes';
}

/** Road width in metres (Night 1 / ?roads=0); `inferred` is false only when OSM carries an explicit width. */
export function roadWidth(tags: Record<string, string>, type: RoadType): { w: number; inferred: boolean } {
  const w = parseFloat(tags.width ?? '');
  if (w > 0.5 && w < 60) return { w, inferred: false };
  const lanes = parseInt(tags.lanes ?? '', 10);
  if (lanes > 0 && lanes < 12 && ROAD_STYLE[type].group >= 2) return { w: lanes * 3.3 + 0.6, inferred: true };
  let d = ROAD_STYLE[type].width;
  if (tags.oneway === 'yes' && ROAD_STYLE[type].group === 3) d *= 0.75;
  if (type === 'footway' && tags.footway === 'sidewalk') d = 1.8;
  return { w: d, inferred: true };
}

const TRUE_ONEWAY_DEFAULTS: Partial<Record<RoadType, number>> = {
  motorway: 7.2, trunk: 9.9, primary: 6.8, secondary: 6.6, tertiary: 6.0, residential: 6.0, service: 4.0,
};
const TRUE_TWOWAY_DEFAULTS: Partial<Record<RoadType, number>> = {
  motorway: 13.2, trunk: 11.0, primary: 9.2, secondary: 7.6, tertiary: 6.8, residential: 6.0, service: 4.0,
};
const TRUE_ROUNDABOUT_DEFAULTS: Partial<Record<RoadType, number>> = {
  motorway: 9.9, trunk: 9.9, primary: 6.6, secondary: 6.6, tertiary: 6.0, residential: 5.6, service: 4.5,
};

/**
 * N2-M2 (?roads=1) Kuching road width in metres:
 *  - explicit `width` tag when valid;
 *  - `lanes * 3.3` m when `lanes` is mapped (clamped >= 3.6 m on single-lane drivable ways for kerb shyness);
 *  - 4.2 m on untagged `*_link` slip lanes;
 *  - retuned Kuching class defaults for untagged one-way dual carriageways, roundabouts and two-way streets.
 */
export function roadWidthTrue(tags: Record<string, string>, type: RoadType): { w: number; inferred: boolean; usedDefault: boolean } {
  const w = parseFloat(tags.width ?? '');
  if (w > 0.5 && w < 60) return { w, inferred: false, usedDefault: false };
  const lanes = parseInt(tags.lanes ?? '', 10);
  if (lanes > 0 && lanes < 12 && ROAD_STYLE[type].group >= 2) {
    return { w: Math.max(3.6, +(lanes * 3.3).toFixed(2)), inferred: true, usedDefault: false };
  }
  if (tags.highway?.endsWith('_link')) return { w: 4.2, inferred: true, usedDefault: true };
  if (tags.junction === 'roundabout' || tags.junction === 'circular') {
    return { w: TRUE_ROUNDABOUT_DEFAULTS[type] ?? ROAD_STYLE[type].width, inferred: true, usedDefault: true };
  }
  const oneWay = tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === 'true' || tags.oneway === '-1' || tags.highway === 'motorway';
  if (ROAD_STYLE[type].group >= 2) {
    const d = (oneWay ? TRUE_ONEWAY_DEFAULTS[type] : TRUE_TWOWAY_DEFAULTS[type]) ?? ROAD_STYLE[type].width;
    return { w: d, inferred: true, usedDefault: true };
  }
  const d = type === 'footway' && tags.footway === 'sidewalk' ? 1.8 : ROAD_STYLE[type].width;
  return { w: d, inferred: true, usedDefault: false };
}

export function isWalkable(tags: Record<string, string>, type: RoadType): boolean {
  if (!ROAD_STYLE[type].walk) return false;
  if (tags.foot === 'no' || tags.access === 'no' || tags.access === 'private') return false;
  return true;
}
