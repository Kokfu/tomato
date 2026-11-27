// N2-M2 road-realism geometry pass (`?roads=1`): runs after build-streetscape.ts and annotates chunk files
// with pre-clipped roundabout central islands (`rbi`), entry splitter & slip-lane gore islands (`spl`),
// give-way lines (`gwl`), dual-carriageway medians (`med`) + twin-arm median lamps (`FURN.lamp` extra=2),
// and underground road tunnel portals (`tpr`), plus writes `public/data/kuching/roads-report.json`.
//
// Everything generated here is gated at runtime by `roadsEnabled()` (`?roads=0` = Night 1 roads).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import polygonClipping from 'polygon-clipping';
import { CHUNK_SIZE, QUANT, DATA_ROOT, chunkKey } from '../../src/world/config.ts';
import type { ChunkData, RoadType } from '../../src/world/types.ts';
import { BUILDING_KINDS, FURN, ROAD_STYLE, ROAD_TYPES } from '../../src/world/types.ts';
import { loadOsm, project, cleanRing, ringArea, pointInRing, roadTypeOf, roadWidthTrue, overriddenTags, isBridge, isTunnel } from './osm.ts';
import type { Pt } from './osm.ts';
import { ROAD_WIDTHS, stationOf } from '../../src/world/district/mainBazaar.ts';
import { CAT_COLUMN, GREAT_CAT, PAIFANG_ID } from '../../src/world/district/padungan.ts';

const DIR = `public/${DATA_ROOT}/chunks`;
const t0 = Date.now();
type Poly = Pt[][];
type MultiPoly = Poly[];

const q = (v: number) => Math.round(v * QUANT);
const closeRing = (r: Pt[]): Pt[] => (r.length ? [...r, r[0]] : []);
const toPC = (p: Poly) => p.map(closeRing);
const fromPC = (mp: Pt[][][]): MultiPoly =>
  mp.map((poly) => poly.map((r) => cleanRing(r as Pt[])).filter((r) => r.length >= 3)).filter((p) => p.length > 0);
const rectPoly = (x0: number, z0: number, x1: number, z1: number): Pt[][] => [
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]],
];

function simplifyRing(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 4) return pts;
  const closed = [...pts, pts[0]];
  const keep = new Uint8Array(closed.length);
  keep[0] = keep[closed.length - 1] = 1;
  // Also preserve the farthest vertex from pts[0] so closed loops never collapse.
  let farI = 1, farD = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) { farD = d; farI = i; }
  }
  keep[farI] = 1;
  const stack: [number, number][] = [[0, farI], [farI, closed.length - 1]];
  while (stack.length) {
    const [a, c] = stack.pop()!;
    const ax = closed[a][0], az = closed[a][1], vx = closed[c][0] - ax, vz = closed[c][1] - az, vv = vx * vx + vz * vz;
    let md = 0, mi = -1;
    for (let i = a + 1; i < c; i++) {
      const t = vv > 0 ? Math.max(0, Math.min(1, ((closed[i][0] - ax) * vx + (closed[i][1] - az) * vz) / vv)) : 0;
      const d = Math.hypot(closed[i][0] - ax - vx * t, closed[i][1] - az - vz * t);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, c]); }
  }
  const out = closed.slice(0, -1).filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

function ringQ(r: Pt[], ox: number, oz: number): number[] {
  const out: number[] = [];
  for (const [x, z] of r) {
    const X = q(x - ox), Z = q(z - oz);
    if (out.length >= 2 && out[out.length - 2] === X && out[out.length - 1] === Z) continue;
    out.push(X, Z);
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}

/** Buffer an open or closed polyline by `hw` metres into a polygon-clipping MultiPoly. */
function ribbonMP(pts: Pt[], hw: number): Pt[][][] {
  if (pts.length < 2) return [];
  const quads: Pt[][][] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (l < 1e-3) continue;
    const ux = (dx / l) * (hw * 0.45), uz = (dz / l) * (hw * 0.45);
    const nx = (-dz / l) * hw, nz = (dx / l) * hw;
    quads.push([[
      [a[0] - ux + nx, a[1] - uz + nz],
      [b[0] + ux + nx, b[1] + uz + nz],
      [b[0] + ux - nx, b[1] + uz - nz],
      [a[0] - ux - nx, a[1] - uz - nz],
      [a[0] - ux + nx, a[1] - uz + nz],
    ]]);
  }
  if (!quads.length) return [];
  try {
    return quads.length === 1 ? quads : (polygonClipping.union(quads[0] as any, ...(quads.slice(1) as any)) as unknown as Pt[][][]);
  } catch {
    return quads;
  }
}

const chunks = new Map<string, ChunkData>();
let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;
for (const f of readdirSync(DIR)) {
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as ChunkData;
  chunks.set(`${d.cx}_${d.cz}`, d);
  minCx = Math.min(minCx, d.cx); maxCx = Math.max(maxCx, d.cx);
  minCz = Math.min(minCz, d.cz); maxCz = Math.max(maxCz, d.cz);
  // Idempotent reset of N2-M2 fields and median twin-arm lamps (extra = 2).
  delete d.rbi; delete d.spl; delete d.med; delete d.gwl; delete d.tpr;
  if (d.furn?.length) {
    const kept: number[] = [];
    for (let i = 0; i < d.furn.length; i += 5) {
      if (d.furn[i] === FURN.lamp && d.furn[i + 4] === 2) continue;
      kept.push(d.furn[i], d.furn[i + 1], d.furn[i + 2], d.furn[i + 3], d.furn[i + 4]);
    }
    d.furn = kept;
  }
}
const AREA = { minX: minCx * CHUNK_SIZE, maxX: (maxCx + 1) * CHUNK_SIZE, minZ: minCz * CHUNK_SIZE, maxZ: (maxCz + 1) * CHUNK_SIZE };
const chunkOf = (v: number) => Math.floor(v / CHUNK_SIZE);
const inAreaChunk = (cx: number, cz: number) => chunks.has(chunkKey(cx, cz));

// Collect solid buildings & water polygons in world metres (for median/island clearance).
interface BoxedPoly { bb: [number, number, number, number]; poly: Poly; id?: number }
const solidBuildings: BoxedPoly[] = [];
const waterPolys: BoxedPoly[] = [];
let paifangCentre: Pt | null = null;
const roofKind = BUILDING_KINDS.indexOf('roof');
for (const d of chunks.values()) {
  const ox = d.cx * CHUNK_SIZE, oz = d.cz * CHUNK_SIZE;
  for (const b of d.buildings) {
    const rings = b.r.map((r) => {
      const p: Pt[] = [];
      for (let i = 0; i < r.length; i += 2) p.push([ox + r[i] / QUANT, oz + r[i + 1] / QUANT]);
      return p;
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (b.id === PAIFANG_ID) paifangCentre = [(x0 + x1) / 2, (z0 + z1) / 2];
    if (b.k === roofKind) continue;
    solidBuildings.push({ bb: [x0, z0, x1, z1], poly: rings, id: b.id });
  }
  for (const w of d.water) {
    const rings = w.map((r) => {
      const p: Pt[] = [];
      for (let i = 0; i < r.length; i += 2) p.push([ox + r[i] / QUANT, oz + r[i + 1] / QUANT]);
      return p;
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    waterPolys.push({ bb: [x0, z0, x1, z1], poly: rings });
  }
}

// Load full unclipped OSM highway ways.
interface WayRec {
  id: number;
  type: RoadType;
  tags: Record<string, string>;
  pts: Pt[];
  nodes: number[];
  rw: number;
  hw: number;
  usedDefault: boolean;
  bridge: boolean;
  tunnel: boolean;
  deepTunnel: boolean;
  roundabout: boolean;
  link: boolean;
  dir: 0 | 1 | -1; // 1 = node order, -1 = reverse, 0 = two-way
}
const { elements } = loadOsm();
const ways: WayRec[] = [];
const defaultMainKm = new Map<string, { type: RoadType; km: number; oneway: boolean; ways: number }>();

for (const el of elements) {
  if (el.type !== 'way' || !el.tags?.highway || !el.geometry || !el.nodes) continue;
  if (el.tags.area === 'yes' && el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1]) continue;
  const type = roadTypeOf(el.tags);
  if (!type) continue;
  const ovTags = overriddenTags(el.id, el.tags);
  const { w: rw0, usedDefault } = roadWidthTrue(ovTags, type);
  const rw = ROAD_WIDTHS[el.id] ?? rw0;
  const pts = project(el.geometry);
  if (pts.length < 2 || pts.length !== el.nodes.length) continue;
  const bridge = isBridge(ovTags);
  const tunnel = isTunnel(ovTags);
  const deepTunnel = tunnel && ovTags.tunnel === 'yes' && parseInt(ovTags.layer ?? '0', 10) <= -1;
  const roundabout = ovTags.junction === 'roundabout' || ovTags.junction === 'circular';
  const link = !!ovTags.highway?.endsWith('_link');
  const ow = ovTags.oneway;
  const dir: 0 | 1 | -1 = ow === '-1' || ow === 'reverse' ? -1
    : ow === 'yes' || ow === '1' || ow === 'true' || (ow !== 'no' && (roundabout || ovTags.highway === 'motorway' || ovTags.highway === 'motorway_link')) ? 1 : 0;
  ways.push({ id: el.id, type, tags: ovTags, pts, nodes: el.nodes, rw, hw: rw / 2, usedDefault, bridge, tunnel, deepTunnel, roundabout, link, dir });

  if (usedDefault && !link && !roundabout && ['trunk', 'primary', 'secondary', 'tertiary'].includes(type)) {
    const inside = pts.some(([x, z]) => x >= AREA.minX && x <= AREA.maxX && z >= AREA.minZ && z <= AREA.maxZ);
    if (inside) {
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const key = `${type}|${ovTags.name ?? '(unnamed)'}`;
      const cur = defaultMainKm.get(key) ?? { type, km: 0, oneway: dir !== 0, ways: 0 };
      cur.km += len / 1000;
      cur.ways++;
      if (dir !== 0) cur.oneway = true;
      defaultMainKm.set(key, cur);
    }
  }
}

// Spatial grid of surface drivable segments (group >= 2, !bridge, !tunnel).
interface DrvSeg { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; len: number; hw: number; way: WayRec }
const GCELL = 48;
const drvGrid = new Map<string, DrvSeg[]>();
const allDrvSegs: DrvSeg[] = [];
for (const w of ways) {
  if (ROAD_STYLE[w.type].group < 2 || w.bridge || w.tunnel) continue;
  // Orient segment direction in travel direction when one-way.
  const pts = w.dir === -1 ? [...w.pts].reverse() : w.pts;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const s: DrvSeg = { ax, az, bx, bz, dx: (bx - ax) / len, dz: (bz - az) / len, len, hw: w.hw, way: w };
    allDrvSegs.push(s);
    const pad = w.hw + 20;
    for (let gz = Math.floor((Math.min(az, bz) - pad) / GCELL); gz <= Math.floor((Math.max(az, bz) + pad) / GCELL); gz++) {
      for (let gx = Math.floor((Math.min(ax, bx) - pad) / GCELL); gx <= Math.floor((Math.max(ax, bx) + pad) / GCELL); gx++) {
        const k = `${gx}_${gz}`;
        let l = drvGrid.get(k);
        if (!l) drvGrid.set(k, (l = []));
        l.push(s);
      }
    }
  }
}
function nearSegs(x0: number, z0: number, x1: number, z1: number): DrvSeg[] {
  const out = new Set<DrvSeg>();
  for (let gz = Math.floor(z0 / GCELL); gz <= Math.floor(z1 / GCELL); gz++) {
    for (let gx = Math.floor(x0 / GCELL); gx <= Math.floor(x1 / GCELL); gx++) {
      for (const s of drvGrid.get(`${gx}_${gz}`) ?? []) out.add(s);
    }
  }
  return [...out];
}
function bboxOfRing(r: Pt[]): [number, number, number, number] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}

// =============================================================================================
// 1. Roundabouts: central islands (`rbi`), splitter islands (`spl`), give-way lines (`gwl`)
// =============================================================================================
const rbWays = ways.filter((w) => w.roundabout && !w.tunnel);
const rbParent = new Map<WayRec, WayRec>();
const findRb = (w: WayRec): WayRec => {
  let p = rbParent.get(w)!;
  while (p !== rbParent.get(p)) p = rbParent.get(p)!;
  rbParent.set(w, p);
  return p;
};
const rbByNode = new Map<number, WayRec>();
for (const w of rbWays) rbParent.set(w, w);
for (const w of rbWays) for (const n of w.nodes) {
  const o = rbByNode.get(n);
  if (o) rbParent.set(findRb(w), findRb(o)); else rbByNode.set(n, w);
}
const rbGroups = new Map<WayRec, WayRec[]>();
for (const w of rbWays) { const g = findRb(w); if (!rbGroups.has(g)) rbGroups.set(g, []); rbGroups.get(g)!.push(w); }

const worldIslands: BoxedPoly[] = [];
const worldSplitters: BoxedPoly[] = [];
const worldGiveWays: [number, number, number, number][] = [];

// Node -> ways index for finding roundabout arms.
const waysAtNode = new Map<number, WayRec[]>();
for (const w of ways) {
  if (ROAD_STYLE[w.type].group < 2 || w.tunnel) continue;
  for (const n of w.nodes) {
    let l = waysAtNode.get(n);
    if (!l) waysAtNode.set(n, (l = []));
    if (!l.includes(w)) l.push(w);
  }
}

for (const grp of rbGroups.values()) {
  // Stitch ring polylines in node connectivity order.
  const parts = grp.map((w) => ({ nodes: w.dir === -1 ? [...w.nodes].reverse() : [...w.nodes], pts: w.dir === -1 ? [...w.pts].reverse() : [...w.pts] }));
  let curN = parts[0].nodes.slice(), curP = parts[0].pts.slice();
  const rem = parts.slice(1);
  let guard = 0;
  while (rem.length && curN[0] !== curN[curN.length - 1] && guard++ < 50) {
    const end = curN[curN.length - 1];
    let idx = rem.findIndex((p) => p.nodes[0] === end);
    if (idx >= 0) {
      const nxt = rem.splice(idx, 1)[0];
      curN = curN.concat(nxt.nodes.slice(1));
      curP = curP.concat(nxt.pts.slice(1));
      continue;
    }
    idx = rem.findIndex((p) => p.nodes[p.nodes.length - 1] === end);
    if (idx >= 0) {
      const nxt = rem.splice(idx, 1)[0];
      curN = curN.concat([...nxt.nodes].reverse().slice(1));
      curP = curP.concat([...nxt.pts].reverse().slice(1));
      continue;
    }
    break;
  }
  const ringNodes = new Set<number>();
  for (const w of grp) for (const n of w.nodes) ringNodes.add(n);
  const hwRing = Math.max(...grp.map((w) => w.hw));
  const ringClosed = cleanRing(curP);
  if (ringClosed.length < 3) continue;
  const bb = bboxOfRing(ringClosed);

  // Central island = ring interior minus ring carriageway ribbon, interior surface roads, and interior building pads.
  const ringPolyline: Pt[] = [...ringClosed, ringClosed[0]];
  // For bbox-clipped open arcs (e.g. Bulatan Suleiman at z = -2377), only ribbon the mapped arc, not the closing chord.
  const isClosedLoop = curN[0] === curN[curN.length - 1] || Math.hypot(curP[0][0] - curP[curP.length - 1][0], curP[0][1] - curP[curP.length - 1][1]) < 2.0;
  const cutters: Pt[][][] = [...ribbonMP(isClosedLoop ? ringPolyline : curP, hwRing + 0.04)];
  for (const s of nearSegs(bb[0] - 2, bb[1] - 2, bb[2] + 2, bb[3] + 2)) {
    if (s.way.roundabout) continue;
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    if (pointInRing(mx, mz, ringClosed) || pointInRing(s.ax, s.az, ringClosed) || pointInRing(s.bx, s.bz, ringClosed)) {
      cutters.push(...ribbonMP([[s.ax, s.az], [s.bx, s.bz]], s.hw + 0.6));
    }
  }
  for (const b of solidBuildings) {
    if (b.bb[2] < bb[0] || b.bb[0] > bb[2] || b.bb[3] < bb[1] || b.bb[1] > bb[3]) continue;
    const cx = (b.bb[0] + b.bb[2]) / 2, cz = (b.bb[1] + b.bb[3]) / 2;
    if (pointInRing(cx, cz, ringClosed)) {
      cutters.push(...ribbonMP([...b.poly[0], b.poly[0][0]], 1.8), toPC(b.poly));
    }
  }
  try {
    const diff = fromPC(polygonClipping.difference(toPC([ringClosed]) as any, ...(cutters as any)) as unknown as Pt[][][]);
    for (const poly of diff) {
      const simp: Poly = poly.map((r) => simplifyRing(r, 0.2)).filter((r) => r.length >= 3);
      if (!simp.length || Math.abs(ringArea(simp[0])) < 3.5) continue;
      worldIslands.push({ bb: bboxOfRing(simp[0]), poly: simp });
    }
  } catch { /* skip degenerate ring */ }

  // Collect entry & exit arms meeting ringNodes.
  interface Arm {
    way: WayRec;
    node: number;
    pts: Pt[]; // pts[0] is on ring, pts[1..] go outward
    ox: number; oz: number; // unit outward vector from ring
    isEntry: boolean;
    isExit: boolean;
    oneWay: boolean;
  }
  const arms: Arm[] = [];
  for (const nd of ringNodes) {
    for (const w of waysAtNode.get(nd) ?? []) {
      if (w.roundabout || w.tunnel) continue;
      const ni = w.nodes.indexOf(nd);
      if (ni < 0) continue;
      // Can meet at start (ni === 0), end (ni === last), or interior vertex (two arms).
      const branches: { pts: Pt[]; forwardAlongWay: boolean }[] = [];
      if (ni < w.pts.length - 1) branches.push({ pts: w.pts.slice(ni), forwardAlongWay: true });
      if (ni > 0) branches.push({ pts: w.pts.slice(0, ni + 1).reverse(), forwardAlongWay: false });
      for (const br of branches) {
        if (br.pts.length < 2) continue;
        // Skip short interior stubs inside inhabited block-roundabouts.
        const farPt = br.pts[Math.min(br.pts.length - 1, 2)];
        if (Math.abs(ringArea(ringClosed)) > 800 && pointInRing(farPt[0], farPt[1], ringClosed)) continue;
        let ox = br.pts[1][0] - br.pts[0][0], oz = br.pts[1][1] - br.pts[0][1];
        const ol = Math.hypot(ox, oz);
        if (ol < 0.5) continue;
        ox /= ol; oz /= ol;
        // Travel along `br.pts` outward is `forwardAlongWay ? dir === 1 : dir === -1`.
        const oneWay = w.dir !== 0;
        const goesOut = !oneWay || (br.forwardAlongWay ? w.dir === 1 : w.dir === -1);
        const goesIn = !oneWay || (br.forwardAlongWay ? w.dir === -1 : w.dir === 1);
        arms.push({ way: w, node: nd, pts: br.pts, ox, oz, isEntry: goesIn, isExit: goesOut, oneWay });
      }
    }
  }

  // Helper: point at distance `d` along arm polyline from pts[0], plus local outward tangent.
  const sampleArm = (pts: Pt[], distM: number): { x: number; z: number; ox: number; oz: number } | null => {
    let remD = distM;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      if (remD <= l) {
        return { x: pts[i - 1][0] + (dx / l) * remD, z: pts[i - 1][1] + (dz / l) * remD, ox: dx / l, oz: dz / l };
      }
      remD -= l;
    }
    return null;
  };
  const distToRingCentreline = (x: number, z: number): number => {
    const seq = isClosedLoop ? ringPolyline : curP;
    let best = Infinity;
    for (let i = 1; i < seq.length; i++) {
      const ax = seq[i - 1][0], az = seq[i - 1][1], vx = seq[i][0] - ax, vz = seq[i][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
    }
    return best;
  };

  // Give-way lines across every entry arm, placed just outside the ring carriageway outer edge.
  for (const arm of arms) {
    if (!arm.isEntry) continue;
    let chosen: { x: number; z: number; ox: number; oz: number } | null = null;
    for (let d = hwRing + 0.6; d <= hwRing + 14; d += 0.5) {
      const s = sampleArm(arm.pts, d);
      if (!s) break;
      if (distToRingCentreline(s.x, s.z) >= hwRing + 0.65) { chosen = s; break; }
    }
    if (!chosen) continue;
    // Approaching traffic travels in direction (-ox, -oz); left of approaching driver is (lz, -lx) = (-oz, ox).
    const lx = -chosen.oz, lz = chosen.ox;
    const latL = Math.max(0.4, arm.way.hw - 0.25);
    const latR = arm.oneWay ? -(arm.way.hw - 0.25) : -0.1;
    if (latL - latR < 1.2) continue;
    worldGiveWays.push([
      chosen.x + lx * latL, chosen.z + lz * latL,
      chosen.x + lx * latR, chosen.z + lz * latR,
    ]);
  }

  // Splitter islands between paired one-way entry + exit arms on the same approach corridor.
  const usedEntries = new Set<Arm>(), usedExits = new Set<Arm>();
  for (const en of arms) {
    if (!en.isEntry || !en.oneWay || usedEntries.has(en)) continue;
    let bestEx: Arm | null = null, bestScore = Infinity;
    for (const ex of arms) {
      if (!ex.isExit || !ex.oneWay || ex === en || usedExits.has(ex)) continue;
      const sep = Math.hypot(en.pts[0][0] - ex.pts[0][0], en.pts[0][1] - ex.pts[0][1]);
      if (sep < 2.2 || sep > 44) continue;
      const dot = en.ox * ex.ox + en.oz * ex.oz;
      if (dot < 0.35) continue;
      const score = sep - dot * 6;
      if (score < bestScore) { bestScore = score; bestEx = ex; }
    }
    if (!bestEx) continue;
    usedEntries.add(en); usedExits.add(bestEx);
    const p0 = en.pts[0], q0 = bestEx.pts[0];
    const p1 = sampleArm(en.pts, Math.min(20, hwRing + 12)) ?? en.pts[en.pts.length - 1];
    const q1 = sampleArm(bestEx.pts, Math.min(20, hwRing + 12)) ?? bestEx.pts[bestEx.pts.length - 1];
    const p1Pt: Pt = Array.isArray(p1) ? p1 : [p1.x, p1.z];
    const q1Pt: Pt = Array.isArray(q1) ? q1 : [q1.x, q1.z];
    const rawWedge: Pt[] = cleanRing([p0, p1Pt, [(p1Pt[0] + q1Pt[0]) / 2, (p1Pt[1] + q1Pt[1]) / 2], q1Pt, q0]);
    if (rawWedge.length < 3 || Math.abs(ringArea(rawWedge)) < 2.5) continue;
    const wbb = bboxOfRing(rawWedge);
    const cutWedge: Pt[][][] = [...ribbonMP(isClosedLoop ? ringPolyline : curP, hwRing + 0.35)];
    for (const s of nearSegs(wbb[0] - 4, wbb[1] - 4, wbb[2] + 4, wbb[3] + 4)) {
      if (s.way.roundabout) continue;
      cutWedge.push(...ribbonMP([[s.ax, s.az], [s.bx, s.bz]], s.hw + 0.32));
    }
    try {
      const diff = fromPC(polygonClipping.difference(toPC([rawWedge]) as any, ...(cutWedge as any)) as unknown as Pt[][][]);
      for (const poly of diff) {
        const simp = simplifyRing(poly[0], 0.16);
        const area = Math.abs(ringArea(simp));
        if (simp.length >= 3 && area >= 1.8 && area <= 450) {
          worldSplitters.push({ bb: bboxOfRing(simp), poly: [simp] });
        }
      }
    } catch { /* skip degenerate wedge */ }
  }
}

// =============================================================================================
// 2. Dual-carriageway medians (`med`) + twin-arm median lamp posts (`FURN.lamp` extra = 2)
// =============================================================================================
const DUAL_CLASSES = new Set<RoadType>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const medianQuads: { bb: [number, number, number, number]; quad: Pt[][]; mid: Pt; gap: number; angle: number }[] = [];

for (const w of ways) {
  if (!DUAL_CLASSES.has(w.type) || w.dir === 0 || w.bridge || w.tunnel || w.roundabout || w.link) continue;
  const pts = w.dir === -1 ? [...w.pts].reverse() : w.pts;
  // Sample every ~5 m along travel direction.
  interface MedHit { lx: number; lz: number; rx: number; rz: number; mx: number; mz: number; gap: number; tx: number; tz: number }
  const samples: (MedHit | null)[] = [];
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 0.5) continue;
    const tx = (bx - ax) / segLen, tz = (bz - az) / segLen;
    // Traffic keeps left: right-hand normal toward central median is (-tz, tx).
    const nx = -tz, nz = tx;
    const steps = Math.max(1, Math.ceil(segLen / 5));
    for (let k = 0; k <= steps; k++) {
      if (i > 1 && k === 0) continue;
      const u = k / steps;
      const sx = ax + (bx - ax) * u, sz = az + (bz - az) * u;
      let bestDist = Infinity, bestSeg: DrvSeg | null = null, bestProj: Pt = [0, 0];
      for (const s of nearSegs(sx - 26, sz - 26, sx + 26, sz + 26)) {
        if (s.way.id <= w.id || s.way.dir === 0 || s.way.roundabout || s.way.link || !DUAL_CLASSES.has(s.way.type)) continue;
        // Must travel in the opposite direction.
        if (s.dx * tx + s.dz * tz > -0.75) continue;
        const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz;
        const tProj = Math.max(0, Math.min(1, ((sx - s.ax) * vx + (sz - s.az) * vz) / (l2 || 1)));
        const qx = s.ax + vx * tProj, qz = s.az + vz * tProj;
        const dx = qx - sx, dz = qz - sz;
        const rightProj = dx * nx + dz * nz, alongOff = Math.abs(dx * tx + dz * tz);
        if (rightProj < w.hw + s.hw + 0.65 || rightProj > w.hw + s.hw + 18.5 || alongOff > 4.5) continue;
        if (rightProj < bestDist) { bestDist = rightProj; bestSeg = s; bestProj = [qx, qz]; }
      }
      if (!bestSeg) { samples.push(null); continue; }
      const gap = bestDist - w.hw - bestSeg.hw;
      const lx = sx + nx * (w.hw - 0.04), lz = sz + nz * (w.hw - 0.04);
      const rx = bestProj[0] - nx * (bestSeg.hw - 0.04), rz = bestProj[1] - nz * (bestSeg.hw - 0.04);
      samples.push({ lx, lz, rx, rz, mx: (lx + rx) / 2, mz: (lz + rz) / 2, gap, tx, tz });
    }
  }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (!a || !b) continue;
    if (Math.hypot(b.mx - a.mx, b.mz - a.mz) > 12) continue;
    const ring: Pt[] = cleanRing([[a.lx, a.lz], [b.lx, b.lz], [b.rx, b.rz], [a.rx, a.rz]]);
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 0.8) continue;
    const midPt: Pt = [(a.mx + b.mx) / 2, (a.mz + b.mz) / 2];
    // Main Bazaar draws its own hand-authored median in district/Dressing.ts: do not lay a second one over it.
    if (stationOf(midPt[0], midPt[1]).d < 18) continue;
    medianQuads.push({
      bb: bboxOfRing(ring),
      quad: [[...ring, ring[0]]],
      mid: midPt,
      gap: (a.gap + b.gap) / 2,
      angle: Math.atan2(a.tx + b.tx, a.tz + b.tz),
    });
  }
}

// Tile-wise union + carriageway/building/water difference so every junction & mapped U-turn gap cuts cleanly.
const worldMedians: BoxedPoly[] = [];
const TILE = 512;
const medTiles = new Map<string, typeof medianQuads>();
for (const mq of medianQuads) {
  const k = `${Math.floor(mq.mid[0] / TILE)}_${Math.floor(mq.mid[1] / TILE)}`;
  let l = medTiles.get(k);
  if (!l) medTiles.set(k, (l = []));
  l.push(mq);
}
for (const list of medTiles.values()) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const mq of list) {
    x0 = Math.min(x0, mq.bb[0]); z0 = Math.min(z0, mq.bb[1]);
    x1 = Math.max(x1, mq.bb[2]); z1 = Math.max(z1, mq.bb[3]);
  }
  let merged: Pt[][][] = [];
  try {
    merged = list.length === 1
      ? [list[0].quad]
      : (polygonClipping.union(list[0].quad as any, ...(list.slice(1).map((m) => m.quad) as any)) as unknown as Pt[][][]);
  } catch {
    merged = list.map((m) => m.quad);
  }
  const cutters: Pt[][][] = [];
  for (const s of nearSegs(x0 - 4, z0 - 4, x1 + 4, z1 + 4)) {
    cutters.push(...ribbonMP([[s.ax, s.az], [s.bx, s.bz]], s.hw + 0.2));
  }
  for (const b of solidBuildings) {
    if (b.bb[2] < x0 || b.bb[0] > x1 || b.bb[3] < z0 || b.bb[1] > z1) continue;
    cutters.push(toPC(b.poly));
  }
  for (const w of waterPolys) {
    if (w.bb[2] < x0 || w.bb[0] > x1 || w.bb[3] < z0 || w.bb[1] > z1) continue;
    cutters.push(toPC(w.poly));
  }
  try {
    const diff = cutters.length
      ? fromPC(polygonClipping.difference(merged as any, ...(cutters as any)) as unknown as Pt[][][])
      : fromPC(merged);
    for (const poly of diff) {
      const simp: Poly = poly.map((r) => simplifyRing(r, 0.22)).filter((r) => r.length >= 3);
      if (!simp.length || Math.abs(ringArea(simp[0])) < 2.5) continue;
      worldMedians.push({ bb: bboxOfRing(simp[0]), poly: simp });
    }
  } catch { /* skip degenerate tile */ }
}

// Place twin-arm median lamp posts (`FURN.lamp`, extra = 2) every ~34 m inside wide medians (>= 1.8 m).
let medianLamps = 0;
const placedLamps: Pt[] = [];
const inMedian = (x: number, z: number): boolean => {
  for (const m of worldMedians) {
    if (x < m.bb[0] || x > m.bb[2] || z < m.bb[1] || z > m.bb[3]) continue;
    if (!pointInRing(x, z, m.poly[0])) continue;
    let hole = false;
    for (let i = 1; i < m.poly.length; i++) if (pointInRing(x, z, m.poly[i])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
};
for (const mq of medianQuads) {
  if (mq.gap < 1.8) continue;
  const [x, z] = mq.mid;
  if (stationOf(x, z).d < 18) continue;
  if (Math.hypot(x - CAT_COLUMN.x, z - CAT_COLUMN.z) < 12 || Math.hypot(x - GREAT_CAT.x, z - GREAT_CAT.z) < 14) continue;
  if (paifangCentre && Math.hypot(x - paifangCentre[0], z - paifangCentre[1]) < 14) continue;
  if (placedLamps.some(([px, pz]) => Math.hypot(px - x, pz - z) < 33)) continue;
  if (!inMedian(x, z)) continue;
  const cx = chunkOf(x), cz = chunkOf(z);
  const d = chunks.get(chunkKey(cx, cz));
  if (!d) continue;
  const deg = Math.round((((mq.angle + Math.PI / 2) * 180) / Math.PI + 3600) % 360);
  (d.furn ??= []).push(FURN.lamp, q(x - cx * CHUNK_SIZE), q(z - cz * CHUNK_SIZE), deg, 2);
  placedLamps.push([x, z]);
  medianLamps++;
}

// =============================================================================================
// 3. Underground road tunnel portals (`tpr`)
// =============================================================================================
let tunnelPortals = 0;
const deepWays = ways.filter((w) => w.deepTunnel);
const deepNodeSet = new Set<number>();
for (const w of deepWays) for (const n of w.nodes) deepNodeSet.add(n);
const surfaceTouchNodes = new Set<number>();
for (const w of ways) {
  if (!w.deepTunnel && ROAD_STYLE[w.type].group >= 2) {
    for (const n of w.nodes) if (deepNodeSet.has(n)) surfaceTouchNodes.add(n);
  }
}
for (const w of deepWays) {
  for (const end of [0, w.nodes.length - 1]) {
    const nd = w.nodes[end];
    if (!surfaceTouchNodes.has(nd)) continue;
    const p0 = w.pts[end], p1 = w.pts[end === 0 ? 1 : w.pts.length - 2];
    const vx = p1[0] - p0[0], vz = p1[1] - p0[1], vl = Math.hypot(vx, vz);
    if (vl < 0.5) continue;
    const cx = chunkOf(p0[0]), cz = chunkOf(p0[1]);
    const d = chunks.get(chunkKey(cx, cz));
    if (!d) continue;
    let totalLen = 0;
    for (let i = 1; i < w.pts.length; i++) totalLen += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
    const rampM = Math.min(18, Math.max(8, totalLen * 0.35));
    (d.tpr ??= []).push(
      q(p0[0] - cx * CHUNK_SIZE),
      q(p0[1] - cz * CHUNK_SIZE),
      Math.round((vx / vl) * 1000),
      Math.round((vz / vl) * 1000),
      q(w.hw),
      q(rampM),
    );
    tunnelPortals++;
  }
}

// =============================================================================================
// 4. Clip world polygons (`rbi`, `spl`, `med`, `gwl`) to each 256 x 256 m chunk
// =============================================================================================
function clipPolysToChunks(polys: BoxedPoly[], assign: (d: ChunkData, rings: number[][]) => void): number {
  let emitted = 0;
  for (const item of polys) {
    const [x0, z0, x1, z1] = item.bb;
    for (let cz = chunkOf(z0); cz <= chunkOf(z1); cz++) {
      for (let cx = chunkOf(x0); cx <= chunkOf(x1); cx++) {
        if (!inAreaChunk(cx, cz)) continue;
        const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
        const d = chunks.get(chunkKey(cx, cz))!;
        try {
          const clipped = fromPC(
            polygonClipping.intersection(toPC(item.poly) as any, rectPoly(ox, oz, ox + CHUNK_SIZE, oz + CHUNK_SIZE) as any) as unknown as Pt[][][],
          );
          for (const poly of clipped) {
            const rings = poly.map((r) => ringQ(r, ox, oz)).filter((r) => r.length >= 6);
            if (rings.length) { assign(d, rings); emitted++; }
          }
        } catch { /* skip degenerate clip */ }
      }
    }
  }
  return emitted;
}

const rbiChunks = clipPolysToChunks(worldIslands, (d, rings) => (d.rbi ??= []).push(rings));
const splChunks = clipPolysToChunks(worldSplitters, (d, rings) => (d.spl ??= []).push(rings));
const medChunks = clipPolysToChunks(worldMedians, (d, rings) => (d.med ??= []).push(rings));

let gwlEmitted = 0;
for (const [ax, az, bx, bz] of worldGiveWays) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const cx = chunkOf(mx), cz = chunkOf(mz);
  const d = chunks.get(chunkKey(cx, cz));
  if (!d) continue;
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  (d.gwl ??= []).push(q(ax - ox), q(az - oz), q(bx - ox), q(bz - oz));
  gwlEmitted++;
}

let totalBytes = 0, maxBytes = 0;
for (const d of chunks.values()) {
  const text = JSON.stringify(d);
  writeFileSync(`${DIR}/${d.cx}_${d.cz}.json`, text);
  totalBytes += text.length;
  maxBytes = Math.max(maxBytes, text.length);
}

const defaultMainList = [...defaultMainKm.entries()]
  .map(([k, v]) => ({ name: k.split('|')[1], type: v.type, km: +v.km.toFixed(2), oneway: v.oneway, ways: v.ways }))
  .sort((a, b) => b.km - a.km);

const summary = {
  generatedAt: new Date().toISOString(),
  elapsedS: +((Date.now() - t0) / 1000).toFixed(2),
  roundaboutGroups: rbGroups.size,
  roundaboutIslands: worldIslands.length,
  roundaboutIslandChunkPieces: rbiChunks,
  splitterIslands: worldSplitters.length,
  splitterChunkPieces: splChunks,
  giveWayLines: gwlEmitted,
  medianPolygons: worldMedians.length,
  medianChunkPieces: medChunks,
  medianTwinLamps: medianLamps,
  tunnelPortals,
  chunkBytes: { total: totalBytes, avgKiB: +(totalBytes / chunks.size / 1024).toFixed(2), maxKiB: +(maxBytes / 1024).toFixed(2) },
  mainRoadsUsingClassDefaults: defaultMainList,
};
writeFileSync(`public/${DATA_ROOT}/roads-report.json`, JSON.stringify(summary, null, 2));
const manifestPath = `public/${DATA_ROOT}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.hash = createHash('sha256')
  .update(JSON.stringify({ osm: manifest.osmTimestamp, overture: manifest.overtureRelease ?? null, stats: manifest.stats, totalBytes, maxBytes }))
  .digest('hex')
  .slice(0, 10);
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log('roads-true:', JSON.stringify({ ...summary, hash: manifest.hash, mainRoadsUsingClassDefaults: defaultMainList.length }));
