// N2-M3 signal-junction pass: runs after build-roads-true.ts.
//
// 1. Clusters the 113 mapped `highway=traffic_signals` nodes (`data-src/osm/pois.json`) into the 46 physical
//    mapped signal junctions, plus identifies genuine multi-corridor unsignalled main-road crossroads from
//    `docs/night2/audit/AUDIT.md` section 3.2 (marked `inferred: true`, switchable via `?inferredSignals=0`).
// 2. Places one `FURN.signal` pole (`extra >= 1`, encoding `{ jctId, group, inferred, wide }`) on the left kerb
//    of EVERY incoming drivable approach arm of each signalized junction (keeping Night 1's `extra === 0` poles
//    solely for `?signals=0`), and writes `public/data/kuching/signals.json` so `Life` and the 3D signal lenses
//    share one exact junction timer (`jctId`, `refDeg`) across multi-node dual-carriageway intersections.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CHUNK_SIZE, QUANT, DATA_ROOT, chunkKey } from '../../src/world/config.ts';
import type { ChunkData, RoadType } from '../../src/world/types.ts';
import { BUILDING_KINDS, FURN } from '../../src/world/types.ts';
import { geoToWorld, worldToGeo } from '../../src/world/GeoProjection.ts';
import { pointInRingFlat, projectOnSegment } from '../../src/world/arch/frontage.ts';
import { ROAD_WIDTHS } from '../../src/world/district/mainBazaar.ts';
import { CAT_COLUMN } from '../../src/world/district/padungan.ts';
import { crossCorridor, encodeSignalExtra, signalPhaseGroup } from '../../src/world/signalsFlag.ts';
import type { SignalJunctionRecord, SignalsFile } from '../../src/world/signalsFlag.ts';
import { loadOsm, project, roadTypeOf, roadWidthTrue, overriddenTags, isBridge, isTunnel } from './osm.ts';
import type { Pt } from './osm.ts';

const DIR = `public/${DATA_ROOT}/chunks`;
const q = (v: number) => Math.round(v * QUANT);
const chunkOf = (v: number) => Math.floor(v / CHUNK_SIZE);

const chunks = new Map<string, ChunkData>();
let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;
for (const f of readdirSync(DIR)) {
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as ChunkData;
  chunks.set(`${d.cx}_${d.cz}`, d);
  minCx = Math.min(minCx, d.cx); maxCx = Math.max(maxCx, d.cx);
  minCz = Math.min(minCz, d.cz); maxCz = Math.max(maxCz, d.cz);
  // Idempotent reset: remove any N2-M3 signal poles (`extra > 0`), keeping legacy `extra === 0` for `?signals=0`.
  if (d.furn?.length) {
    const kept: number[] = [];
    for (let i = 0; i < d.furn.length; i += 5) {
      if (d.furn[i] === FURN.signal && d.furn[i + 4] > 0) continue;
      kept.push(d.furn[i], d.furn[i + 1], d.furn[i + 2], d.furn[i + 3], d.furn[i + 4]);
    }
    d.furn = kept;
  }
}
const AREA = { minX: minCx * CHUNK_SIZE, maxX: (maxCx + 1) * CHUNK_SIZE, minZ: minCz * CHUNK_SIZE, maxZ: (maxCz + 1) * CHUNK_SIZE };
const inArea = (x: number, z: number) => x >= AREA.minX && x <= AREA.maxX && z >= AREA.minZ && z <= AREA.maxZ;

// Spatial indexes for buildings & water so signal poles never stand inside a building or river.
interface Bld { ring: number[]; minX: number; maxX: number; minZ: number; maxZ: number }
const CELL = 32;
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const bldGrid = new Map<string, Bld[]>();
const waterGrid = new Map<string, number[][][]>();
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
  for (const b of d.buildings) {
    if (BUILDING_KINDS[b.k] === 'roof') continue;
    const ring = b.r[0].map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
    addTo(bldGrid, x0, z0, x1, z1, { ring, minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  }
  for (const poly of d.water) {
    const rings = poly.map((r) => r.map((v, i) => (i % 2 ? oz : ox) + v / QUANT));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < rings[0].length; i += 2) { x0 = Math.min(x0, rings[0][i]); x1 = Math.max(x1, rings[0][i]); z0 = Math.min(z0, rings[0][i + 1]); z1 = Math.max(z1, rings[0][i + 1]); }
    addTo(waterGrid, x0, z0, x1, z1, rings);
  }
}
function buildingAt(x: number, z: number): boolean {
  for (const b of bldGrid.get(gk(x, z)) ?? []) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
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

// Load OSM ways (with N2-M2 overrides & true widths).
const DRIVABLE = new Set<RoadType>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential']);
const MAIN_TYPES = new Set<RoadType>(['motorway', 'trunk', 'primary', 'secondary']);
const TYPE_RANK: Record<string, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, residential: 5 };

interface Way {
  id: number;
  type: RoadType;
  name: string;
  pts: Pt[];
  nodes: number[];
  hw: number;
  rb: boolean;
  bridge: boolean;
  tunnel: boolean;
  link: boolean;
  dir: 0 | 1 | -1;
}
interface WaySeg {
  way: Way;
  idx: number; // segment nodes[idx] -> nodes[idx + 1]
  ax: number;
  az: number;
  bx: number;
  bz: number;
  na: number;
  nb: number;
}

const { elements } = loadOsm();
const ways: Way[] = [];
const segGrid = new Map<string, WaySeg[]>();
const nodePos = new Map<number, Pt>();
const nodeWays = new Map<number, Way[]>();
const rbNodes = new Set<number>();

for (const el of elements) {
  if (el.type !== 'way' || !el.tags?.highway || !el.geometry || !el.nodes) continue;
  if (el.tags.area === 'yes' && el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1]) continue;
  const tags = overriddenTags(el.id, el.tags);
  if (tags.service === 'emergency_access') continue;
  const motor = tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
  if (motor === 'no' || motor === 'private') continue;
  const type = roadTypeOf(tags);
  if (!type || !DRIVABLE.has(type)) continue;
  const pts = project(el.geometry);
  if (pts.length < 2 || pts.length !== el.nodes.length) continue;
  const rw = ROAD_WIDTHS[el.id] ?? roadWidthTrue(tags, type).w;
  const rb = tags.junction === 'roundabout' || tags.junction === 'circular';
  const bridge = isBridge(tags);
  const tunnel = isTunnel(tags);
  const link = !!tags.highway?.endsWith('_link');
  const ow = tags.oneway;
  const dir: 0 | 1 | -1 = ow === '-1' || ow === 'reverse' ? -1
    : ow === 'yes' || ow === '1' || ow === 'true' || (ow !== 'no' && (rb || tags.highway?.startsWith('motorway'))) ? 1 : 0;
  const w: Way = { id: el.id, type, name: tags.name ?? '', pts, nodes: el.nodes, hw: rw / 2, rb, bridge, tunnel, link, dir };
  ways.push(w);
  if (rb) for (const nd of el.nodes) rbNodes.add(nd);
  if (bridge || tunnel) continue;
  for (let i = 0; i < el.nodes.length; i++) {
    nodePos.set(el.nodes[i], pts[i]);
    if (!rb) {
      let l = nodeWays.get(el.nodes[i]);
      if (!l) nodeWays.set(el.nodes[i], (l = []));
      if (!l.includes(w)) l.push(w);
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const s: WaySeg = { way: w, idx: i, ax, az, bx, bz, na: el.nodes[i], nb: el.nodes[i + 1] };
    addTo(segGrid, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), s);
  }
}

function segsNear(x: number, z: number, r: number): WaySeg[] {
  const out = new Set<WaySeg>();
  for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++)
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++)
      for (const s of segGrid.get(`${gx},${gz}`) ?? []) out.add(s);
  return [...out];
}

function onAnyCarriageway(x: number, z: number, ownWayId: number, pad = 0.35): boolean {
  for (const s of segsNear(x, z, 14)) {
    if (s.way.id === ownWayId) continue;
    if (projectOnSegment(x, z, s.ax, s.az, s.bx, s.bz)[1] < s.way.hw + pad) return true;
  }
  return false;
}

interface Approach {
  way: Way;
  /** Direction of travel approaching the junction (unit vector). */
  tx: number;
  tz: number;
  /** Stop node / crossing point at the junction. */
  vx: number;
  vz: number;
  /** Length of the incoming segment available for setback. */
  segLen: number;
  hw: number;
}

function approachesForNodes(jctNodes: Set<number>): Approach[] {
  const raw: Approach[] = [];
  const seenSeg = new Set<string>();
  for (const v of jctNodes) {
    const vp = nodePos.get(v);
    if (!vp) continue;
    for (const w of nodeWays.get(v) ?? []) {
      if (w.rb || w.bridge || w.tunnel || w.name === 'Jalan China') continue;
      for (let i = 0; i < w.nodes.length; i++) {
        if (w.nodes[i] !== v) continue;
        // Candidate incoming neighbours: i-1 -> i (travelling forward along nodes) and i+1 -> i (travelling reverse).
        for (const step of [-1, 1] as const) {
          const j = i + step;
          if (j < 0 || j >= w.nodes.length) continue;
          // Check travel direction from j -> i:
          // step === -1 means j = i-1 -> i (along node order: allowed when dir === 0 or dir === 1)
          // step === +1 means j = i+1 -> i (against node order: allowed when dir === 0 or dir === -1)
          if (step === -1 && w.dir === -1) continue;
          if (step === 1 && w.dir === 1) continue;
          const u = w.nodes[j];
          if (jctNodes.has(u)) continue; // interior segment within split dual-carriageway box
          const key = `${w.id}:${j}->${i}`;
          if (seenSeg.has(key)) continue;
          seenSeg.add(key);
          // Walk back up to ~18 m along the way (staying outside jctNodes) for stable approach tangent.
          let ux = w.pts[j][0], uz = w.pts[j][1];
          const firstLen = Math.hypot(vp[0] - ux, vp[1] - uz);
          if (firstLen < 1.0 && j + step >= 0 && j + step < w.nodes.length && !jctNodes.has(w.nodes[j + step])) {
            ux = w.pts[j + step][0]; uz = w.pts[j + step][1];
          }
          const dx = vp[0] - ux, dz = vp[1] - uz, len = Math.hypot(dx, dz);
          if (len < 1.5) continue;
          raw.push({ way: w, tx: dx / len, tz: dz / len, vx: vp[0], vz: vp[1], segLen: firstLen, hw: w.hw });
        }
      }
    }
  }
  // Deduplicate near-coincident approaches (e.g. slip lane splitting right at the stop node).
  raw.sort((a, b) => (TYPE_RANK[a.way.type] - TYPE_RANK[b.way.type]) || (b.hw - a.hw));
  const kept: Approach[] = [];
  for (const a of raw) {
    const dup = kept.some((k) => Math.hypot(k.vx - a.vx, k.vz - a.vz) < 4.5 && k.tx * a.tx + k.tz * a.tz > 0.92);
    if (!dup) kept.push(a);
  }
  return kept;
}

function chooseRefDeg(apps: Approach[]): number {
  if (!apps.length) return 0;
  // Rank corridors in 5-degree bins weighted by road class & width.
  let bestScore = -1, bestRad = Math.atan2(apps[0].tx, apps[0].tz);
  for (const a of apps) {
    const base = ((Math.atan2(a.tx, a.tz) % Math.PI) + Math.PI) % Math.PI;
    let score = 0;
    for (const b of apps) {
      if (signalPhaseGroup(Math.atan2(b.tx, b.tz), base) === 0) {
        score += (7 - (TYPE_RANK[b.way.type] ?? 5)) * 10 + b.hw * (b.way.link ? 0.5 : 2);
      }
    }
    if (score > bestScore) { bestScore = score; bestRad = base; }
  }
  const rad = ((bestRad % Math.PI) + Math.PI) % Math.PI;
  return Math.round((rad * 180) / Math.PI) % 180;
}

// ---------------------------------------------------------------------------------------------
// 1. Mapped `highway=traffic_signals` junctions (46 clusters from 113 OSM nodes)
// ---------------------------------------------------------------------------------------------
interface RawSig { id: number; x: number; z: number; lat: number; lon: number }
const pois = existsSync('data-src/osm/pois.json')
  ? (JSON.parse(readFileSync('data-src/osm/pois.json', 'utf8')).elements as any[])
  : [];
const sigNodes: RawSig[] = pois
  .filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals')
  .map((e) => {
    const [x, z] = geoToWorld(e.lat, e.lon);
    return { id: e.id as number, x, z, lat: e.lat as number, lon: e.lon as number };
  });

const uf = sigNodes.map((_, i) => i);
const find = (i: number): number => (uf[i] === i ? i : (uf[i] = find(uf[i])));
for (let i = 0; i < sigNodes.length; i++) {
  for (let j = i + 1; j < sigNodes.length; j++) {
    if (Math.hypot(sigNodes[i].x - sigNodes[j].x, sigNodes[i].z - sigNodes[j].z) <= 45) uf[find(j)] = find(i);
  }
}
const mappedGroups = new Map<number, RawSig[]>();
sigNodes.forEach((s, i) => {
  const r = find(i);
  let l = mappedGroups.get(r);
  if (!l) mappedGroups.set(r, (l = []));
  l.push(s);
});

interface CandidateJunction {
  inferred: boolean;
  cx: number;
  cz: number;
  osmSignalNodes: number[];
  jctNodes: Set<number>;
  pelicanApps?: Approach[];
  extraGraphPts?: [number, number][];
}
const allCandidates: CandidateJunction[] = [];

const sortedMapped = [...mappedGroups.values()].sort((a, b) => a[0].id - b[0].id);
/** Mapped signal clusters that get no N2-M3 junction, and why (printed at the end). */
const dropped: { osm: number[]; x: number; z: number; why: string }[] = [];
for (const group of sortedMapped) {
  const cx = group.reduce((s, n) => s + n.x, 0) / group.length;
  const cz = group.reduce((s, n) => s + n.z, 0) / group.length;
  if (!inArea(cx, cz)) { dropped.push({ osm: group.map((n) => n.id), x: Math.round(cx), z: Math.round(cz), why: 'outside the map area' }); continue; }
  const jctNodes = new Set<number>();
  // Collect intersection nodes (>= 2 distinct ways, not roundabout ring) near any signal node in this cluster,
  // plus any signal node that itself is a road node!
  for (const s of group) {
    if (nodeWays.has(s.id) && !rbNodes.has(s.id)) jctNodes.add(s.id);
    for (const [nd, p] of nodePos) {
      if (rbNodes.has(nd)) continue;
      const ws = nodeWays.get(nd);
      if (!ws || ws.length < 2) continue;
      if (Math.hypot(p[0] - s.x, p[1] - s.z) <= 22) jctNodes.add(nd);
    }
  }
  // Expand once (<= 22 m) to include split dual-carriageway twin nodes of the same intersection.
  const seedPts = [...jctNodes].map((nd) => nodePos.get(nd)!);
  for (const sp of seedPts) {
    for (const [nd, p] of nodePos) {
      if (rbNodes.has(nd) || jctNodes.has(nd)) continue;
      const ws = nodeWays.get(nd);
      if (!ws || ws.length < 2) continue;
      if (Math.hypot(p[0] - sp[0], p[1] - sp[1]) <= 22) jctNodes.add(nd);
    }
  }

  let pelicanApps: Approach[] | undefined;
  const extraGraphPts: [number, number][] = [];
  if (approachesForNodes(jctNodes).length === 0) {
    jctNodes.clear();
    // Mid-block pelican / pedestrian signal or roundabout-entry crossing without an interior junction node.
    pelicanApps = [];
    for (const s of group) {
      let best: { seg: WaySeg; u: number; d: number } | null = null;
      for (const seg of segsNear(s.x, s.z, 20)) {
        if (seg.way.rb) continue;
        const [u, d] = projectOnSegment(s.x, s.z, seg.ax, seg.az, seg.bx, seg.bz);
        if (d < (best?.d ?? 20)) best = { seg, u, d };
      }
      if (!best) continue;
      const { seg, u } = best;
      const vx = seg.ax + (seg.bx - seg.ax) * u, vz = seg.az + (seg.bz - seg.az) * u;
      const l = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az) || 1;
      const dx = (seg.bx - seg.ax) / l, dz = (seg.bz - seg.az) / l;
      extraGraphPts.push([+vx.toFixed(2), +vz.toFixed(2)]);
      if (seg.way.dir >= 0) pelicanApps.push({ way: seg.way, tx: dx, tz: dz, vx, vz, segLen: Math.max(6, u * l), hw: seg.way.hw });
      if (seg.way.dir <= 0) pelicanApps.push({ way: seg.way, tx: -dx, tz: -dz, vx, vz, segLen: Math.max(6, (1 - u) * l), hw: seg.way.hw });
    }
  }
  allCandidates.push({
    inferred: false,
    cx,
    cz,
    osmSignalNodes: group.map((n) => n.id),
    jctNodes,
    pelicanApps,
    extraGraphPts,
  });
}

// ---------------------------------------------------------------------------------------------
// 2. Audit-inferred main-road crossroads (`inferred: true`, switchable via `?inferredSignals=0`)
// ---------------------------------------------------------------------------------------------
interface CandNode { nd: number; x: number; z: number; mainNames: string[] }
const candNodes: CandNode[] = [];
for (const [nd, ws] of nodeWays) {
  if (rbNodes.has(nd)) continue;
  const [x, z] = nodePos.get(nd)!;
  if (!inArea(x, z)) continue;
  // Skip if already covered by or within 55 m of any mapped OSM signal node.
  if (sigNodes.some((s) => Math.hypot(s.x - x, s.z - z) < 55)) continue;
  // Skip the hand-built Cat Column open triangle & Square Tower riverfront bend.
  if (Math.hypot(x - CAT_COLUMN.x, z - CAT_COLUMN.z) < 42) continue;
  if (Math.hypot(x - 111.2, z - (-144.0)) < 35) continue;
  const mainWays = ws.filter((w) => MAIN_TYPES.has(w.type) && !w.link && w.name);
  const mainNames = [...new Set(mainWays.map((w) => w.name))];
  if (mainNames.length >= 2) candNodes.push({ nd, x, z, mainNames });
}
candNodes.sort((a, b) => a.nd - b.nd);
const cuf = candNodes.map((_, i) => i);
const cfind = (i: number): number => (cuf[i] === i ? i : (cuf[i] = cfind(cuf[i])));
for (let i = 0; i < candNodes.length; i++) {
  for (let j = i + 1; j < candNodes.length; j++) {
    if (Math.hypot(candNodes[i].x - candNodes[j].x, candNodes[i].z - candNodes[j].z) <= 44) cuf[cfind(j)] = cfind(i);
  }
}
const infGroups = new Map<number, CandNode[]>();
candNodes.forEach((c, i) => {
  const r = cfind(i);
  let l = infGroups.get(r);
  if (!l) infGroups.set(r, (l = []));
  l.push(c);
});

for (const group of infGroups.values()) {
  const cx = group.reduce((s, n) => s + n.x, 0) / group.length;
  const cz = group.reduce((s, n) => s + n.z, 0) / group.length;
  const jctNodes = new Set<number>(group.map((g) => g.nd));
  // Include split dual-carriageway partner nodes within 22 m.
  for (const g of group) {
    for (const [nd, p] of nodePos) {
      if (rbNodes.has(nd) || jctNodes.has(nd)) continue;
      if ((nodeWays.get(nd)?.length ?? 0) >= 2 && Math.hypot(p[0] - g.x, p[1] - g.z) <= 22) jctNodes.add(nd);
    }
  }
  const apps = approachesForNodes(jctNodes);
  if (apps.length < 3) continue;
  const refDeg = chooseRefDeg(apps);
  const refRad = (refDeg * Math.PI) / 180;
  const hasG0 = apps.some((a) => signalPhaseGroup(Math.atan2(a.tx, a.tz), refRad) === 0);
  const hasG1 = apps.some((a) => signalPhaseGroup(Math.atan2(a.tx, a.tz), refRad) === 1);
  // Only signalize genuine multi-phase crossroads where two perpendicular traffic streams actually conflict.
  if (!hasG0 || !hasG1) continue;
  allCandidates.push({
    inferred: true,
    cx,
    cz,
    osmSignalNodes: [],
    jctNodes,
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Emit per-approach `FURN.signal` poles (`extra >= 1`) and `signals.json`
// ---------------------------------------------------------------------------------------------
const outJunctions: SignalJunctionRecord[] = [];
let placedPoles = 0, mappedPoles = 0, inferredPoles = 0, wideMastPoles = 0;
const placedWorldPts: Pt[] = [];

function placePoleForApproach(a: Approach, extra: number): boolean {
  const setbacks = [Math.min(6.0, a.segLen * 0.38), 4.2, 8.2, 2.8].filter((s) => s <= a.segLen + 0.5);
  for (const side of [1, -1] as const) {
    for (const sb of setbacks) {
      for (const pad of [0.68, 1.15, 0.42]) {
        const bx = a.vx - a.tx * sb, bz = a.vz - a.tz * sb;
        // Left of `(tx, tz)` in (+x east, +z south) is `(+tz, -tx)`.
        const px = bx + a.tz * (a.hw + pad) * side, pz = bz - a.tx * (a.hw + pad) * side;
        if (!inArea(px, pz) || buildingAt(px, pz) || inWater(px, pz)) continue;
        if (onAnyCarriageway(px, pz, a.way.id, 0.3)) continue;
        if (placedWorldPts.some(([ox, oz]) => Math.hypot(ox - px, oz - pz) < 2.2)) continue;
        const cx = chunkOf(px), cz = chunkOf(pz);
        const d = chunks.get(chunkKey(cx, cz));
        if (!d) continue;
        // Local +Z of `FURN.signal` points along `(sin(rot), cos(rot))` -> face oncoming traffic `(-tx, -tz)`.
        const rot = Math.atan2(-a.tx, -a.tz);
        const deg = Math.round(((rot * 180) / Math.PI + 3600) % 360);
        (d.furn ??= []).push(FURN.signal, q(px - cx * CHUNK_SIZE), q(pz - cz * CHUNK_SIZE), deg, extra);
        placedWorldPts.push([px, pz]);
        return true;
      }
    }
  }
  return false;
}

for (const cand of allCandidates) {
  const apps = cand.pelicanApps ?? approachesForNodes(cand.jctNodes);
  const why = (w: string) => { if (!cand.inferred) dropped.push({ osm: cand.osmSignalNodes, x: Math.round(cand.cx), z: Math.round(cand.cz), why: w }); };
  if (!apps.length) { why('no drivable approach found'); continue; }
  const id = outJunctions.length;
  const refDeg = chooseRefDeg(apps);
  const refRad = (refDeg * Math.PI) / 180;
  // The crossing corridor is the approach farthest from the main one, so skewed crossroads still get two phases.
  // Two approaches are one road through a crossing (even on a bend): one phase.
  const crossDeg = Math.round((crossCorridor(apps.length > 2 ? apps.map((a) => Math.atan2(a.tx, a.tz)) : [], refRad) * 180) / Math.PI) % 180;
  const crossRad = (crossDeg * Math.PI) / 180;
  const roadNames = [...new Set(apps.map((a) => a.way.name).filter(Boolean))];
  let jctPlaced = 0;
  for (const a of apps) {
    const group = signalPhaseGroup(Math.atan2(a.tx, a.tz), refRad, crossRad);
    // Only mount overhead mast-arm on left-side poles (`wide` checked inside placePole if needed; left is tried first).
    const wide = a.hw >= 3.9;
    const extra = encodeSignalExtra({ jctId: id, group, inferred: cand.inferred, wide });
    if (placePoleForApproach(a, extra)) {
      jctPlaced++;
      placedPoles++;
      if (cand.inferred) inferredPoles++; else mappedPoles++;
      if (wide) wideMastPoles++;
    }
  }
  if (!jctPlaced) { why('no free kerb spot for a pole'); continue; }
  const controlledPts: [number, number][] = [
    ...[...cand.jctNodes].map((nd) => {
      const p = nodePos.get(nd)!;
      return [+p[0].toFixed(2), +p[1].toFixed(2)] as [number, number];
    }),
    ...(cand.extraGraphPts ?? []),
  ];
  const [lat, lon] = worldToGeo(cand.cx, cand.cz);
  outJunctions.push({
    id,
    x: +cand.cx.toFixed(1),
    z: +cand.cz.toFixed(1),
    lat: +lat.toFixed(5),
    lon: +lon.toFixed(5),
    refDeg,
    crossDeg,
    inferred: cand.inferred,
    roads: roadNames,
    osmSignalNodes: cand.osmSignalNodes,
    nodes: controlledPts,
    approaches: jctPlaced,
  });
}

let totalBytes = 0, maxBytes = 0;
// The data hash (`?v=`) covers the content, not only the sizes: a pole's phase bit can change without changing a byte count.
const content = createHash('sha256');
for (const key of [...chunks.keys()].sort()) {
  const d = chunks.get(key)!;
  const text = JSON.stringify(d);
  writeFileSync(`${DIR}/${d.cx}_${d.cz}.json`, text);
  content.update(key).update(text);
  totalBytes += text.length;
  maxBytes = Math.max(maxBytes, text.length);
}

const signalsFile: SignalsFile = { version: 1, junctions: outJunctions };
const signalsJson = JSON.stringify(signalsFile, null, 2);
writeFileSync(`public/${DATA_ROOT}/signals.json`, signalsJson);
content.update(signalsJson);

const manifestPath = `public/${DATA_ROOT}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.hash = createHash('sha256')
  .update(JSON.stringify({ osm: manifest.osmTimestamp, overture: manifest.overtureRelease ?? null, stats: manifest.stats, totalBytes, maxBytes, content: content.digest('hex') }))
  .digest('hex')
  .slice(0, 10);
writeFileSync(manifestPath, JSON.stringify(manifest));

console.log('signals:', JSON.stringify({
  mappedJunctions: outJunctions.filter((j) => !j.inferred).length,
  inferredJunctions: outJunctions.filter((j) => j.inferred).length,
  totalJunctions: outJunctions.length,
  placedPoles,
  mappedPoles,
  inferredPoles,
  wideMastPoles,
  chunkAvgKiB: +(totalBytes / chunks.size / 1024).toFixed(2),
  hash: manifest.hash,
}));
for (const d of dropped) console.log(`signals: mapped cluster without a junction (${d.why}) at x ${d.x}, z ${d.z}: OSM nodes ${d.osm.join(', ')}`);
