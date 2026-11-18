// Generates the pedestrian routing graph (public/data/kuching/graph.json) used by the in-game
// navigation (src/ui/Router.ts). Run after build.ts: it reads the cached OSM extract for the way
// topology and the generated chunk files for the water and building footprints the player
// actually collides with, so routes agree with the playable world.
//
//   node tools/generate-world/build-graph.ts [--decks] [--debug]
//
//   --decks  also accept untagged ways over water where build.ts already generated a walkable deck
//            (boardwalks / jetties mapped inside the river polygon). Off by default.
//   --debug  print every segment dropped for crossing water or a building.
//   --drive  V8.4: build the car routing graph (public/data/kuching/drive-graph.json) instead.
//
// Drive profile (--drive):
//  - only carriageway classes a car may use (src/vehicle/RoadQuery.ts DRIVABLE_CLASSES) that are wide
//    enough for the car (the same width rule as RoadQuery.isDrivable); pedestrian streets, footways,
//    paths, steps, cycleways, tracks and piers are never part of it;
//  - access=no|private, motor_vehicle / motorcar / vehicle = no|private and service=emergency_access are out;
//  - oneway=yes|true|1, oneway=-1, junction=roundabout|circular and motorways are directed edges (flag 4:
//    travel from node a to node b only); no deck rule (only bridge-tagged ways cross water);
//  - turn restrictions are not available: the OSM extract holds no type=restriction relations.
//
// Rules:
//  - only walkable highway ways (osm.ts isWalkable) and open man_made=pier ways, inside the manifest area;
//  - OSM nodes shared between ways are junctions (no geometric snapping, so nothing is invented);
//  - a segment that lies over water becomes an edge only when its way is bridge-tagged or a pier;
//  - a segment that passes through a solid building footprint is dropped (the player cannot walk it);
//  - chains of degree-2 nodes with identical attributes are contracted into one edge with geometry.
import { readFileSync, writeFileSync } from 'node:fs';
import { CHUNK_SIZE, QUANT } from '../../src/world/config.ts';
import { ROAD_TYPES, BUILDING_KINDS } from '../../src/world/types.ts';
import type { ChunkData, Manifest, RoadType } from '../../src/world/types.ts';
import type { GraphFile } from '../../src/ui/Router.ts';
import { GRAPH_SCALE, GRAPH_VERSION } from '../../src/ui/Router.ts';
import { loadOsm, project, roadTypeOf, isWalkable, isBridge, isTunnel, isClosedWay, roadWidth } from './osm.ts';
import { DRIVABLE_CLASSES, SIDE_CLEARANCE } from '../../src/vehicle/RoadQuery.ts';
import { CAR } from '../../src/vehicle/VehiclePhysics.ts';
import { EDGE_ONEWAY } from '../../src/ui/Router.ts';
import type { Pt } from './osm.ts';

const OUT = 'public/data/kuching';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[graph ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8')) as Manifest;
let cx0 = Infinity, cx1 = -Infinity, cz0 = Infinity, cz1 = -Infinity;
for (const k of manifest.chunks) {
  const [cx, cz] = k.split('_').map(Number);
  cx0 = Math.min(cx0, cx); cx1 = Math.max(cx1, cx); cz0 = Math.min(cz0, cz); cz1 = Math.max(cz1, cz);
}
const AREA = { minX: cx0 * CHUNK_SIZE, maxX: (cx1 + 1) * CHUNK_SIZE, minZ: cz0 * CHUNK_SIZE, maxZ: (cz1 + 1) * CHUNK_SIZE };
const inArea = (p: Pt) => p[0] >= AREA.minX && p[0] <= AREA.maxX && p[1] >= AREA.minZ && p[1] <= AREA.maxZ;

// ---------------------------------------------------------------------------------------------
// Obstacles from the generated chunks: water polygons (per chunk) and solid building footprints.
// ---------------------------------------------------------------------------------------------
const chunkWater = new Map<string, number[][][]>();
interface Footprint { rings: number[][]; bb: [number, number, number, number] }
const GRID = 64;
const buildingGrid = new Map<string, Footprint[]>();
const roofKind = BUILDING_KINDS.indexOf('roof');
let nBuildings = 0;
// Ways the main build turned into walkable decks (chunk road flag bit 1). Only consulted with --decks.
const deckWays = new Set<number>();
const ALLOW_DECKS = process.argv.includes('--decks');
const DEBUG = process.argv.includes('--debug');
const DRIVE = process.argv.includes('--drive');
const NO = new Set(['no', 'private']);
/** Drive profile: may a car use this way, and in which direction (0 = both, 1 = node order, -1 = against it)? */
function driveAccess(tags: Record<string, string>, type: RoadType): { ok: boolean; dir: 0 | 1 | -1 } {
  const no = { ok: false, dir: 0 as const };
  if (!DRIVABLE_CLASSES.has(type)) return no;
  if (tags.service === 'emergency_access') return no;
  const motor = tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle;
  if (motor !== undefined ? NO.has(motor) : NO.has(tags.access ?? '')) return no;
  if (roadWidth(tags, type).w < CAR.halfWid * 2 + 2 * SIDE_CLEARANCE) return no;
  const ow = tags.oneway;
  if (ow === '-1' || ow === 'reverse') return { ok: true, dir: -1 };
  if (ow === 'yes' || ow === 'true' || ow === '1') return { ok: true, dir: 1 };
  if (ow === 'no') return { ok: true, dir: 0 };
  if (tags.junction === 'roundabout' || tags.junction === 'circular' || tags.highway === 'motorway' || tags.highway === 'motorway_link') return { ok: true, dir: 1 };
  return { ok: true, dir: 0 };
}
const driveStats = { excludedAccess: 0, excludedNarrow: 0, onewayWays: 0 };
for (const key of manifest.chunks) {
  const c = JSON.parse(readFileSync(`${OUT}/chunks/${key}.json`, 'utf8')) as ChunkData;
  for (const r of c.roads) if (r.f & 1) deckWays.add(r.id);
  const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
  const abs = (r: number[]) => r.map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
  if (c.water.length) chunkWater.set(key, c.water.map((poly) => poly.map(abs)));
  for (const b of c.buildings) {
    if (b.k === roofKind) continue; // open-sided roofs do not block movement
    const rings = b.r.map(abs);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < rings[0].length; i += 2) {
      x0 = Math.min(x0, rings[0][i]); x1 = Math.max(x1, rings[0][i]); z0 = Math.min(z0, rings[0][i + 1]); z1 = Math.max(z1, rings[0][i + 1]);
    }
    const f: Footprint = { rings, bb: [x0, z0, x1, z1] };
    nBuildings++;
    for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) {
      const k = `${gx}_${gz}`;
      let cell = buildingGrid.get(k);
      if (!cell) buildingGrid.set(k, (cell = []));
      cell.push(f);
    }
  }
}
function inRingFlat(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function inPolyFlat(x: number, z: number, poly: number[][]): boolean {
  if (!inRingFlat(x, z, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRingFlat(x, z, poly[i])) return false;
  return true;
}
function inWater(x: number, z: number): boolean {
  const polys = chunkWater.get(`${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`);
  if (!polys) return false;
  for (const p of polys) if (inPolyFlat(x, z, p)) return true;
  return false;
}
function inBuilding(x: number, z: number): boolean {
  const cell = buildingGrid.get(`${Math.floor(x / GRID)}_${Math.floor(z / GRID)}`);
  if (!cell) return false;
  for (const f of cell) {
    if (x < f.bb[0] || x > f.bb[2] || z < f.bb[1] || z > f.bb[3]) continue;
    if (inPolyFlat(x, z, f.rings)) return true;
  }
  return false;
}
/** Sample the open interior of a segment (always including the midpoint) every <= step metres. */
function anySample(a: Pt, b: Pt, step: number, test: (x: number, z: number) => boolean): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const m = n % 2 ? n + 1 : n; // even count => the midpoint is one of the samples
  for (let i = 1; i < m; i++) {
    const t = i / m;
    if (test(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
  }
  return false;
}
log(`area ${JSON.stringify(AREA)}, ${chunkWater.size} chunks with water, ${nBuildings} solid buildings`);

// ---------------------------------------------------------------------------------------------
// Segments from walkable OSM ways
// ---------------------------------------------------------------------------------------------
interface Seg { a: number; b: number; attr: number; len: number }
interface Attr { t: number; f: number; n: number; way: number }
const { elements } = loadOsm();
const names: string[] = [];
const nameIdx = new Map<string, number>();
const attrs: Attr[] = [];
const attrIdx = new Map<string, number>();
const pos = new Map<number, Pt>();
const segs: Seg[] = [];
const stats = { ways: 0, segments: 0, untaggedDeckSegments: 0, droppedWater: 0, droppedBuilding: 0, droppedOutside: 0, bridgeSegments: 0 };

for (const el of elements) {
  const tags = el.tags;
  if (el.type !== 'way' || !tags || !el.geometry || !el.nodes) continue;
  let type: RoadType | null = null;
  let bridge = false;
  let dir: 0 | 1 | -1 = 0;
  if (DRIVE) {
    if (!tags.highway || (tags.area === 'yes' && isClosedWay(el))) continue;
    type = roadTypeOf(tags);
    if (!type || !DRIVABLE_CLASSES.has(type)) continue;
    const acc = driveAccess(tags, type);
    if (!acc.ok) {
      if (roadWidth(tags, type).w < CAR.halfWid * 2 + 2 * SIDE_CLEARANCE) driveStats.excludedNarrow++; else driveStats.excludedAccess++;
      continue;
    }
    dir = acc.dir;
    if (dir) driveStats.onewayWays++;
    bridge = isBridge(tags);
  } else if (tags.man_made === 'pier') {
    if (isClosedWay(el)) continue;
    type = 'pier';
    bridge = true;
  } else if (tags.highway) {
    if (tags.area === 'yes' && isClosedWay(el)) continue;
    type = roadTypeOf(tags);
    if (!type || !isWalkable(tags, type)) continue;
    bridge = isBridge(tags);
  }
  if (!type) continue;
  const pts = project(el.geometry);
  if (pts.length !== el.nodes.length) continue;
  let n = -1;
  if (tags.name) {
    n = nameIdx.get(tags.name) ?? -1;
    if (n < 0) { n = names.length; names.push(tags.name); nameIdx.set(tags.name, n); }
  }
  const f = (bridge ? 1 : 0) | (isTunnel(tags) ? 2 : 0) | (dir ? EDGE_ONEWAY : 0);
  // The OSM way id is kept for bridge / pier edges only (it identifies the crossing and keeps the file small).
  const way = bridge ? el.id : 0;
  const ak = `${ROAD_TYPES.indexOf(type)}|${f}|${n}|${way}`;
  let ai = attrIdx.get(ak);
  if (ai === undefined) { ai = attrs.length; attrs.push({ t: ROAD_TYPES.indexOf(type), f, n, way }); attrIdx.set(ak, ai); }
  const ti = ROAD_TYPES.indexOf(type), wayId = el.id;
  let deckAttr = -1;
  const deckAttrOf = (): number => {
    if (deckAttr < 0) {
      const k = `${ti}|${f | 1}|${n}|${wayId}`;
      deckAttr = attrIdx.get(k) ?? -1;
      if (deckAttr < 0) { deckAttr = attrs.length; attrs.push({ t: ti, f: f | 1, n, way: wayId }); attrIdx.set(k, deckAttr); }
    }
    return deckAttr;
  };
  let used = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (el.nodes[i - 1] === el.nodes[i]) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    if (!inArea(a) || !inArea(b)) { stats.droppedOutside++; continue; }
    let deck = bridge;
    if (!bridge && ((inWater(a[0], a[1]) && inWater(b[0], b[1])) || anySample(a, b, 2, inWater))) {
      // Untagged way over water. By default it never becomes an edge; with --decks it is accepted only
      // where the main build already made this way a walkable deck (boardwalks, jetties, pontoons).
      if (ALLOW_DECKS && !DRIVE && deckWays.has(wayId)) { deck = true; stats.untaggedDeckSegments++; }
      else {
        stats.droppedWater++;
        if (DEBUG) console.log('water', wayId, tags.highway, a.map(Math.round), b.map(Math.round));
        continue;
      }
    }
    if (!deck && anySample(a, b, 1.5, inBuilding)) {
      stats.droppedBuilding++;
      if (DEBUG) console.log('building', wayId, tags.highway, a.map(Math.round), b.map(Math.round));
      continue;
    }
    pos.set(el.nodes[i - 1], a);
    pos.set(el.nodes[i], b);
    // Directed (one-way) segments run from a to b in the direction of travel.
    const [na, nb] = dir === -1 ? [el.nodes[i], el.nodes[i - 1]] : [el.nodes[i - 1], el.nodes[i]];
    segs.push({ a: na, b: nb, attr: deck && !bridge ? deckAttrOf() : ai, len });
    if (deck) stats.bridgeSegments++;
    used = true;
  }
  if (used) stats.ways++;
}
stats.segments = segs.length;

// Duplicate segments (two ways drawn over the same node pair): keep one per attribute.
{
  const seen = new Set<string>();
  let w = 0;
  for (const s of segs) {
    const k = s.a < s.b || attrs[s.attr].f & EDGE_ONEWAY ? `${s.a}_${s.b}_${s.attr}` : `${s.b}_${s.a}_${s.attr}`;
    if (seen.has(k)) continue;
    seen.add(k);
    segs[w++] = s;
  }
  segs.length = w;
}

// ---------------------------------------------------------------------------------------------
// Contract degree-2 chains with identical attributes
// ---------------------------------------------------------------------------------------------
const inc = new Map<number, number[]>();
segs.forEach((s, i) => {
  for (const n of [s.a, s.b]) {
    let l = inc.get(n);
    if (!l) inc.set(n, (l = []));
    l.push(i);
  }
});
const isJunction = (n: number): boolean => {
  const l = inc.get(n)!;
  if (l.length !== 2) return true;
  if (segs[l[0]].attr !== segs[l[1]].attr) return true;
  // a two-segment loop back to the same neighbour must stay split
  const o0 = segs[l[0]].a === n ? segs[l[0]].b : segs[l[0]].a, o1 = segs[l[1]].a === n ? segs[l[1]].b : segs[l[1]].a;
  if (o0 === o1) return true;
  // One-way chains contract only where the flow continues (one segment ends here, the other starts here).
  if (attrs[segs[l[0]].attr].f & EDGE_ONEWAY) return (segs[l[0]].b === n) === (segs[l[1]].b === n);
  return false;
};
interface Edge { a: number; b: number; attr: number; mid: number[] }
const edges: Edge[] = [];
const usedSeg = new Uint8Array(segs.length);
const walk = (start: number, first: number): void => {
  const mid: number[] = [];
  let node = start, si = first;
  // A one-way chain walked against its direction is stored reversed, so that a -> b is the direction of travel.
  const rev = (attrs[segs[first].attr].f & EDGE_ONEWAY) !== 0 && segs[first].a !== start;
  for (;;) {
    usedSeg[si] = 1;
    const s = segs[si];
    const next = s.a === node ? s.b : s.a;
    if (next === start || isJunction(next)) {
      edges.push(rev ? { a: next, b: start, attr: s.attr, mid: mid.reverse() } : { a: start, b: next, attr: s.attr, mid });
      return;
    }
    mid.push(next);
    const l = inc.get(next)!;
    si = l[0] === si ? l[1] : l[0];
    node = next;
  }
};
// Deterministic order: nodes by OSM id.
const nodeIds = [...inc.keys()].sort((a, b) => a - b);
for (const n of nodeIds) if (isJunction(n)) for (const si of inc.get(n)!) if (!usedSeg[si]) walk(n, si);
// Closed rings made only of degree-2 nodes: start anywhere.
for (const n of nodeIds) for (const si of inc.get(n)!) if (!usedSeg[si]) walk(n, si);

// Light geometry simplification (0.3 m), re-verified against water and buildings.
const d10 = (v: number) => Math.round(v * GRAPH_SCALE);
const snapPt = (p: Pt): Pt => [d10(p[0]) / GRAPH_SCALE, d10(p[1]) / GRAPH_SCALE];
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, c] = stack.pop()!;
    const ax = pts[a][0], az = pts[a][1], vx = pts[c][0] - ax, vz = pts[c][1] - az, vv = vx * vx + vz * vz;
    let md = 0, mi = -1;
    for (let i = a + 1; i < c; i++) {
      const t = vv > 0 ? Math.max(0, Math.min(1, ((pts[i][0] - ax) * vx + (pts[i][1] - az) * vz) / vv)) : 0;
      const d = Math.hypot(pts[i][0] - ax - vx * t, pts[i][1] - az - vz * t);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, c]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const polyClear = (pts: Pt[]): boolean => {
  for (let i = 1; i < pts.length; i++) if (anySample(pts[i - 1], pts[i], 2, inWater) || anySample(pts[i - 1], pts[i], 1.5, inBuilding)) return false;
  return true;
};

const nodeIndex = new Map<number, number>();
const nodesOut: number[] = [];
const nodeOf = (id: number): number => {
  let i = nodeIndex.get(id);
  if (i === undefined) {
    i = nodeIndex.size;
    nodeIndex.set(id, i);
    const p = pos.get(id)!;
    nodesOut.push(d10(p[0]), d10(p[1]));
  }
  return i;
};
const edgesOut: number[] = [];
const geomOut: number[] = [];
const ways: Record<string, number> = {};
let totalKm = 0, bridgeEdges = 0, vertices = 0, wetAfterQuant = 0;
edges.forEach((e, ei) => {
  const at = attrs[e.attr];
  const full: Pt[] = [e.a, ...e.mid, e.b].map((id) => snapPt(pos.get(id)!));
  let pts = full;
  if (full.length > 2) {
    const s = simplify(full, 0.3);
    pts = at.f & 1 || polyClear(s) ? s : full;
  }
  if (!(at.f & 1) && !polyClear(pts)) wetAfterQuant++;
  const a = nodeOf(e.a), b = nodeOf(e.b);
  edgesOut.push(a, b, at.t, at.f, at.n, pts.length - 2);
  let px = d10(pts[0][0]), pz = d10(pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const x = d10(pts[i][0]), z = d10(pts[i][1]);
    geomOut.push(x - px, z - pz);
    px = x; pz = z;
  }
  for (let i = 1; i < pts.length; i++) totalKm += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 1000;
  vertices += pts.length - 2;
  if (at.way) { ways[ei] = at.way; bridgeEdges++; }
});

const graph: GraphFile = {
  v: GRAPH_VERSION,
  scale: GRAPH_SCALE,
  bounds: AREA,
  types: [...ROAD_TYPES],
  names,
  nodes: nodesOut,
  edges: edgesOut,
  geom: geomOut,
  ways,
};
if (DRIVE) graph.profile = 'drive';
const json = JSON.stringify(graph);
const FILE = DRIVE ? 'drive-graph.json' : 'graph.json';
writeFileSync(`${OUT}/${FILE}`, json);
log('stats', JSON.stringify({
  ...stats, ...(DRIVE ? driveStats : {}), nodes: nodesOut.length / 2, edges: edges.length, shapeVertices: vertices, bridgeEdges, names: names.length,
  lengthKm: +totalKm.toFixed(1), edgesTouchingObstacleAfterQuantisation: wetAfterQuant, bytes: json.length,
}));
log(`wrote ${OUT}/${FILE} (${(json.length / 1024).toFixed(0)} KiB)`);
