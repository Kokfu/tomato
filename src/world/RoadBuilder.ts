import * as THREE from 'three';
import { v5Exclusion } from '../v5/geo.ts';
import { CHUNK_SIZE, QUANT, WATER_LEVEL } from './config.ts';
import type { ChunkData, RoadData } from './types.ts';
import { ROAD_TYPES, ROAD_STYLE } from './types.ts';
import { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';
import { streetEdges, laneMarkings, stopLine, KERB_H, PAINT_WHITE } from './StreetEdges.ts';
import { pointInRing } from './CollisionWorld.ts';
import { roadsEnabled, roadWidthCm, ROAD_DEEP_TUNNEL, ROAD_LINK, ROAD_ROUNDABOUT, ROAD_SUSPENSION } from './roadsFlag.ts';
import { m5Enabled } from './district/m5.ts';
import { stationOfChunk } from './district/props.ts';
import { buildPromenadePaving, ringRailing, ringRailingAt } from './district/PromenadeMesh.ts';
import { buildIndiaStreet } from './district/IndiaStreetMesh.ts';
import { buildPlazaEntrance } from './district/PlazaMesh.ts';
import { buildPadungan } from './district/PadunganMesh.ts';
import { buildGraves } from './district/GravesMesh.ts';

const UP = [0, 1, 0] as const;
const tmpColor = new THREE.Color();
const RAIL = new THREE.Color(0xc9ccd0);
const CONCRETE = new THREE.Color(0x9a968c);
const QUAY = new THREE.Color(0x8b8578);
const RAIL_PAINT = new THREE.Color(0x3d4a52);
const KERB_STONE = new THREE.Color(0xb9b5a9);
const KERB_WHITE_C = new THREE.Color(0xdedbd0);
const KERB_BLACK_C = new THREE.Color(0x2c2d2e);
const ISLAND_TURF = new THREE.Color(0x5c843e);
const SPLITTER_PAVE = new THREE.Color(0xb2ada1);
const TUNNEL_THROAT = new THREE.Color(0x16181a);
const SUSP_STEEL = new THREE.Color(0xd2d6da);
const SUSP_CABLE = new THREE.Color(0x4c5359);
const UNIFIED_ASPHALT = 0x5f6163;

interface Sample { x: number; z: number; y: number }

/** Resample a road polyline (chunk-local metres) so it follows the terrain. */
function samplePolyline(r: RoadData, ox: number, oz: number, ctx: BuildContext, maxStep: number, yOff: number): Sample[] {
  const out: Sample[] = [];
  const n = r.p.length / 2;
  for (let i = 0; i < n; i++) {
    const x = r.p[i * 2] / QUANT, z = r.p[i * 2 + 1] / QUANT;
    const e = r.e ? r.e[i] / QUANT : NaN;
    if (i > 0) {
      const px = r.p[i * 2 - 2] / QUANT, pz = r.p[i * 2 - 1] / QUANT;
      const pe = r.e ? r.e[i - 1] / QUANT : NaN;
      const len = Math.hypot(x - px, z - pz);
      const steps = Math.ceil(len / maxStep);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const sx = px + (x - px) * t, sz = pz + (z - pz) * t;
        out.push({ x: sx, z: sz, y: r.e ? pe + (e - pe) * t + yOff : ctx.height.sample(ox + sx, oz + sz) + yOff });
      }
    }
    out.push({ x, z, y: r.e ? e + yOff : ctx.height.sample(ox + x, oz + z) + yOff });
  }
  return out;
}

/** Left/right offset points with mitred joins. */
function offsets(pts: Sample[], hw: number): { lx: number; lz: number; rx: number; rz: number }[] {
  const n = pts.length;
  const res = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    let d1x = b.x - a.x, d1z = b.z - a.z, d2x = c.x - b.x, d2z = c.z - b.z;
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    if (l1 > 1e-6) { d1x /= l1; d1z /= l1; } else { d1x = d2x / (l2 || 1); d1z = d2z / (l2 || 1); }
    if (l2 > 1e-6) { d2x /= l2; d2z /= l2; } else { d2x = d1x; d2z = d1z; }
    let nx = -(d1z + d2z), nz = d1x + d2x;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) { nx = -d1z; nz = d1x; } else { nx /= nl; nz /= nl; }
    const cos = Math.max(0.45, nx * -d1z + nz * d1x);
    const m = hw / cos;
    res.push({ lx: b.x + nx * m, lz: b.z + nz * m, rx: b.x - nx * m, rz: b.z - nz * m });
  }
  return res;
}

function ribbon(buf: GeoBuf, pts: Sample[], hw: number, color: THREE.Color, ox: number, oz: number, ctx: BuildContext, drape: boolean, yOff: number, caps: boolean): void {
  if (pts.length < 2) return;
  const off = offsets(pts, hw);
  let prevL = -1, prevR = -1;
  for (let i = 0; i < pts.length; i++) {
    const o = off[i];
    const yl = drape ? ctx.height.sample(ox + o.lx, oz + o.lz) + yOff : pts[i].y;
    const yr = drape ? ctx.height.sample(ox + o.rx, oz + o.rz) + yOff : pts[i].y;
    const L = buf.vert(o.lx, yl, o.lz, ...UP, color);
    const R = buf.vert(o.rx, yr, o.rz, ...UP, color);
    if (i > 0) { buf.triUp(prevL, prevR, R); buf.triUp(prevL, R, L); }
    prevL = L; prevR = R;
  }
  if (!caps) return;
  // Round end caps fill junctions where several ways meet.
  for (const end of [0, pts.length - 1]) {
    const p = pts[end], q = pts[end === 0 ? 1 : pts.length - 2];
    const base = Math.atan2(p.z - q.z, p.x - q.x);
    const c = buf.vert(p.x, p.y, p.z, ...UP, color);
    let prev = -1;
    const SEG = 6;
    for (let k = 0; k <= SEG; k++) {
      const a = base - Math.PI / 2 + (Math.PI * k) / SEG;
      const x = p.x + Math.cos(a) * hw, z = p.z + Math.sin(a) * hw;
      const v = buf.vert(x, drape ? ctx.height.sample(ox + x, oz + z) + yOff : p.y, z, ...UP, color);
      if (prev >= 0) buf.triUp(c, prev, v);
      prev = v;
    }
  }
}

function quad(buf: GeoBuf, ax: number, ay0: number, ay1: number, az: number, bx: number, by0: number, by1: number, bz: number, c: THREE.Color): void {
  let nx = -(bz - az), nz = bx - ax;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  const a = buf.vert(ax, ay0, az, nx, 0, nz, c), b = buf.vert(bx, by0, bz, nx, 0, nz, c);
  const d = buf.vert(ax, ay1, az, nx, 0, nz, c), e = buf.vert(bx, by1, bz, nx, 0, nz, c);
  buf.tri(a, b, e);
  buf.tri(a, e, d);
}

/** Deck sides, railings and piers for a bridge road (plus N2-M2 suspension towers & cables when flagged). */
function bridgeStructure(buf: GeoBuf, pts: Sample[], hw: number, ox: number, oz: number, ctx: BuildContext, pier: boolean, suspension = false): void {
  const off = offsets(pts, hw);
  let dist = 0, nextPost = 0, nextPier = 14, nextHanger = 3;
  const cableHeightAt = (x: number, z: number, y: number): number => {
    const clear = Math.max(0, y - WATER_LEVEL - 1.5);
    const arch = Math.min(1, clear / 7.5);
    // Towers stand near the bank transition; cable sags parabolically across the river channel.
    const u = Math.max(0, Math.min(1, (arch - 0.18) / 0.82));
    return 1.35 + 11.8 * (1 - u) * (1 - u);
  };
  let prevWet = pts.length ? ctx.collision.inWater(ox + pts[0].x, oz + pts[0].z) : false;
  for (let i = 1; i < pts.length; i++) {
    const a = off[i - 1], b = off[i], pa = pts[i - 1], pb = pts[i];
    const curWet = ctx.collision.inWater(ox + pb.x, oz + pb.z);
    const thick = pier ? 0.3 : suspension ? 0.38 : 0.55;
    for (const side of [0, 1]) {
      const ax = side ? a.rx : a.lx, az = side ? a.rz : a.lz, bx = side ? b.rx : b.lx, bz = side ? b.rz : b.lz;
      quad(buf, ax, pa.y - thick, pa.y, az, bx, pb.y - thick, pb.y, bz, suspension ? SUSP_STEEL : CONCRETE);
      if (!pier) {
        quad(buf, ax, pa.y + 1.02, pa.y + 1.1, az, bx, pb.y + 1.02, pb.y + 1.1, bz, RAIL);
        quad(buf, ax, pa.y + 0.5, pa.y + 0.56, az, bx, pb.y + 0.5, pb.y + 0.56, bz, RAIL);
      }
      if (suspension && (prevWet || curWet)) {
        const cya = pa.y + cableHeightAt(pa.x, pa.z, pa.y), cyb = pb.y + cableHeightAt(pb.x, pb.z, pb.y);
        quad(buf, ax, cya - 0.06, cya + 0.06, az, bx, cyb - 0.06, cyb + 0.06, bz, SUSP_CABLE);
      }
    }
    // underside
    const u0 = buf.vert(a.lx, pa.y - thick, a.lz, 0, -1, 0, CONCRETE), u1 = buf.vert(a.rx, pa.y - thick, a.rz, 0, -1, 0, CONCRETE);
    const u2 = buf.vert(b.rx, pb.y - thick, b.rz, 0, -1, 0, CONCRETE), u3 = buf.vert(b.lx, pb.y - thick, b.lz, 0, -1, 0, CONCRETE);
    buf.tri(u0, u1, u2); buf.tri(u0, u2, u3);

    const segLen = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    if (segLen < 1e-4) { prevWet = curWet; continue; }
    const dx = (pb.x - pa.x) / segLen, dz = (pb.z - pa.z) / segLen;
    // Suspension H-pylon at each river shoreline crossing.
    if (suspension && prevWet !== curWet) {
      const tx = prevWet ? pb.x : pa.x, tz = prevWet ? pb.z : pa.z, ty = prevWet ? pb.y : pa.y;
      const gY = ctx.height.sample(ox + tx, oz + tz) - 0.5, topY = ty + 13.4;
      for (const s of [-1, 1]) {
        const lx = tx - dz * (hw + 0.25) * s, lz = tz + dx * (hw + 0.25) * s, r = 0.28;
        const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
        for (let k = 0; k < 4; k++) {
          quad(buf, lx + c[k][0], gY, topY, lz + c[k][1], lx + c[(k + 1) % 4][0], gY, topY, lz + c[(k + 1) % 4][1], SUSP_STEEL);
        }
      }
      const lx0 = tx - dz * (hw + 0.25), lz0 = tz + dx * (hw + 0.25), lx1 = tx + dz * (hw + 0.25), lz1 = tz - dx * (hw + 0.25);
      for (const beamY of [ty + 5.2, topY - 0.5]) {
        quad(buf, lx0, beamY, beamY + 0.42, lz0, lx1, beamY, beamY + 0.42, lz1, SUSP_STEEL);
      }
    }
    while (!pier && nextPost <= dist + segLen) {
      const t = (nextPost - dist) / segLen;
      const y = pa.y + (pb.y - pa.y) * t;
      for (const s of [-1, 1]) {
        const cx = pa.x + (pb.x - pa.x) * t - dz * hw * s, cz = pa.z + (pb.z - pa.z) * t + dx * hw * s;
        quad(buf, cx - dx * 0.04, y, y + 1.1, cz - dz * 0.04, cx + dx * 0.04, y, y + 1.1, cz + dz * 0.04, RAIL);
      }
      nextPost += 2.5;
    }
    while (suspension && (prevWet || curWet) && nextHanger <= dist + segLen) {
      const t = (nextHanger - dist) / segLen;
      const hx = pa.x + (pb.x - pa.x) * t, hz = pa.z + (pb.z - pa.z) * t, y = pa.y + (pb.y - pa.y) * t;
      const cy = y + cableHeightAt(hx, hz, y);
      for (const s of [-1, 1]) {
        const cx = hx - dz * hw * s, cz = hz + dx * hw * s;
        quad(buf, cx - dx * 0.025, y + 1.05, cy, cz - dz * 0.025, cx + dx * 0.025, y + 1.05, cy, cz + dz * 0.025, SUSP_CABLE);
      }
      nextHanger += 5.5;
    }
    while (nextPier <= dist + segLen) {
      const t = (nextPier - dist) / segLen;
      const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t, y = pa.y + (pb.y - pa.y) * t - thick;
      const wetHere = ctx.collision.inWater(ox + x, oz + z);
      if (!(suspension && wetHere)) {
        const ground = wetHere ? WATER_LEVEL - 1.5 : ctx.height.sample(ox + x, oz + z);
        if (y - ground > 1.2) {
          const r = pier ? 0.18 : Math.min(0.7, hw * 0.35);
          const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
          for (let k = 0; k < 4; k++) {
            const p = c[k], n = c[(k + 1) % 4];
            quad(buf, x + p[0], ground, y, z + p[1], x + n[0], ground, y, z + n[1], CONCRETE);
          }
        }
      }
      nextPier += pier ? 6 : 28;
    }
    dist += segLen;
    prevWet = curWet;
  }
}

/** Raised Malaysian black-and-white kerbed island (`grassTop` = roundabout/median turf; false = splitter paving). */
function buildKerbedPolys(
  polys: number[][][], ox: number, oz: number, ctx: BuildContext, structure: GeoBuf, turfBuf: GeoBuf, grassTop: boolean, low: boolean,
): void {
  const gAt = (x: number, z: number) => ctx.height.sample(ox + x, oz + z);
  for (const poly of polys) {
    if (!poly.length || poly[0].length < 6) continue;
    const outerFlat = poly[0].map((v) => v / QUANT);
    const holesVec = poly.slice(1).filter((h) => h.length >= 6).map((h) => toVec2(h.map((v) => v / QUANT)));
    const outerVec = toVec2(outerFlat);
    let area = 0;
    for (let i = 0, j = outerVec.length - 1; i < outerVec.length; j = i++) {
      area += outerVec[j].x * outerVec[i].y - outerVec[i].x * outerVec[j].y;
    }
    const useGrass = grassTop && Math.abs(area) * 0.5 >= 5.5;
    const capCol = useGrass ? ISLAND_TURF : SPLITTER_PAVE;
    const capBuf = useGrass ? turfBuf : structure;
    const ids = THREE.ShapeUtils.triangulateShape(outerVec, holesVec);
    const allPts: [number, number][] = outerVec.map((v) => [v.x, v.y]);
    for (const h of holesVec) for (const v of h) allPts.push([v.x, v.y]);
    const base = capBuf.count;
    const topH = KERB_H - 0.008;
    for (const [x, z] of allPts) capBuf.vert(x, gAt(x, z) + topH, z, ...UP, capCol);
    for (const t of ids) capBuf.triUp(base + t[0], base + t[1], base + t[2]);

    // Raised perimeter kerb ring: continuous white/stone kerb wall + top lip, with black blocks overlaid on major islands.
    const paintBlocks = !low && grassTop && Math.abs(area) * 0.5 >= 18;
    const baseKerbCol = paintBlocks ? KERB_WHITE_C : KERB_STONE;
    for (const ringCm of poly) {
      if (ringCm.length < 6) continue;
      const n = ringCm.length / 2;
      let rArea = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        rArea += (ringCm[j * 2] * ringCm[i * 2 + 1] - ringCm[i * 2] * ringCm[j * 2 + 1]);
      }
      const sign = (ringCm === poly[0] ? 1 : -1) * (rArea >= 0 ? 1 : -1);
      let acc = 0;
      const kw = 0.2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = ringCm[i * 2] / QUANT, az = ringCm[i * 2 + 1] / QUANT;
        const bx = ringCm[j * 2] / QUANT, bz = ringCm[j * 2 + 1] / QUANT;
        const eps = 0.03;
        const onChunkEdge = (Math.abs(ax) < eps && Math.abs(bx) < eps)
          || (Math.abs(ax - CHUNK_SIZE) < eps && Math.abs(bx - CHUNK_SIZE) < eps)
          || (Math.abs(az) < eps && Math.abs(bz) < eps)
          || (Math.abs(az - CHUNK_SIZE) < eps && Math.abs(bz - CHUNK_SIZE) < eps);
        if (onChunkEdge) continue;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.08) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const inX = -dz * sign, inZ = dx * sign;
        const ga = gAt(ax, az), gb = gAt(bx, bz);
        quad(structure, ax, ga - 0.02, ga + KERB_H, az, bx, gb - 0.02, gb + KERB_H, bz, baseKerbCol);
        const v0 = structure.vert(ax, ga + KERB_H, az, ...UP, baseKerbCol);
        const v1 = structure.vert(bx, gb + KERB_H, bz, ...UP, baseKerbCol);
        const v2 = structure.vert(bx + inX * kw, gAt(bx + inX * kw, bz + inZ * kw) + KERB_H, bz + inZ * kw, ...UP, baseKerbCol);
        const v3 = structure.vert(ax + inX * kw, gAt(ax + inX * kw, az + inZ * kw) + KERB_H, az + inZ * kw, ...UP, baseKerbCol);
        structure.triUp(v0, v1, v2); structure.triUp(v0, v2, v3);
        if (paintBlocks) {
          for (let s = Math.ceil((acc - 1.2) / 2.4) * 2.4 - acc; s < len; s += 2.4) {
            const s0 = Math.max(0, s), s1 = Math.min(len, s + 1.2);
            if (s1 - s0 < 0.15) continue;
            const x0 = ax + dx * s0, z0 = az + dz * s0, x1 = ax + dx * s1, z1 = az + dz * s1;
            const y0 = gAt(x0, z0) + KERB_H + 0.004, y1 = gAt(x1, z1) + KERB_H + 0.004;
            const b0 = structure.vert(x0, y0, z0, ...UP, KERB_BLACK_C);
            const b1 = structure.vert(x1, y1, z1, ...UP, KERB_BLACK_C);
            const b2 = structure.vert(x1 + inX * kw, y1, z1 + inZ * kw, ...UP, KERB_BLACK_C);
            const b3 = structure.vert(x0 + inX * kw, y0, z0 + inZ * kw, ...UP, KERB_BLACK_C);
            structure.triUp(b0, b1, b2); structure.triUp(b0, b2, b3);
          }
        }
        acc += len;
      }
    }
  }
}

export interface NearStructure { geo: THREE.BufferGeometry; x: number; z: number; maxDist: number }
export interface RoadMeshes { groups: (THREE.BufferGeometry | null)[]; marks: THREE.BufferGeometry | null; structure: GeoBuf; near?: NearStructure }

/**
 * Road ribbons (grouped by draw layer), lane markings, and bridge structures for a chunk. A generator: it yields
 * between roads so that ChunkManager can spread a heavy chunk over several frames (V8.2); the result is the same.
 */
export function* buildRoads(data: ChunkData, ctx: BuildContext, structure: GeoBuf): Generator<void, { groups: (THREE.BufferGeometry | null)[]; marks: THREE.BufferGeometry | null; near?: NearStructure }> {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const high = ctx.detail === 'high';
  const trueRoads = roadsEnabled();
  const bufs = [new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf()];
  const marks = new GeoBuf();
  // Spatial lookup for precomputed N2-M2 islands/medians (so StreetEdges suppresses inner roundabout drains & duplicate kerbs).
  const islandPolys: { x0: number; z0: number; x1: number; z1: number; poly: number[][] }[] = [];
  if (trueRoads && high) {
    for (const poly of [...(data.rbi ?? []), ...(data.med ?? []), ...(data.spl ?? [])]) {
      if (!poly.length) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < poly[0].length; i += 2) {
        const x = poly[0][i] / QUANT, z = poly[0][i + 1] / QUANT;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      islandPolys.push({ x0: x0 - 0.35, z0: z0 - 0.35, x1: x1 + 0.35, z1: z1 + 0.35, poly });
    }
  }
  const inIsland = trueRoads && islandPolys.length
    ? (x: number, z: number): boolean => {
      const xCm = x * QUANT, zCm = z * QUANT;
      for (const b of islandPolys) {
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        if (!pointInRing(xCm, zCm, b.poly[0])) continue;
        let hole = false;
        for (let k = 1; k < b.poly.length; k++) if (pointInRing(xCm, zCm, b.poly[k])) { hole = true; break; }
        if (!hole) return true;
      }
      return false;
    }
    : undefined;
  // Carriageway segments of this chunk (chunk-local metres) for the kerb clearance test.
  const lanes: number[] = [];
  for (const r of data.roads) {
    const st = ROAD_STYLE[ROAD_TYPES[r.t]];
    if (!high || st.group < 2 || (trueRoads && (r.f & ROAD_DEEP_TUNNEL))) continue;
    const hw = roadWidthCm(r) / QUANT / 2;
    const isOneWay = (r.f & 8) !== 0 || (trueRoads && (r.f & (ROAD_ROUNDABOUT | ROAD_LINK)) !== 0);
    for (let i = 2; i < r.p.length; i += 2) lanes.push(r.p[i - 2] / QUANT, r.p[i - 1] / QUANT, r.p[i] / QUANT, r.p[i + 1] / QUANT, hw, r.id, st.group === 3 && isOneWay ? 1 : 0);
  }
  // Vertices of the drivable roads of this chunk (for stop lines & N2-M2 corner fillets).
  const nodes = new Map<number, { id: number; hw: number; end: boolean; dx: number; dz: number; x: number; z: number; major: boolean; rb: boolean }[]>();
  if (high) for (const r of data.roads) {
    const st = ROAD_STYLE[ROAD_TYPES[r.t]];
    if (st.group < 2 || !st.major || r.f & 3 || (trueRoads && (r.f & ROAD_DEEP_TUNNEL))) continue;
    const hw = roadWidthCm(r) / QUANT / 2;
    const rb = (r.f & ROAD_ROUNDABOUT) !== 0;
    const n = r.p.length / 2;
    for (let i = 0; i < n; i++) {
      const end = i === 0 || i === n - 1, o = i === 0 ? 1 : i - 1;
      const vx = r.p[o * 2] - r.p[i * 2], vz = r.p[o * 2 + 1] - r.p[i * 2 + 1], vl = Math.hypot(vx, vz) || 1;
      const k = r.p[i * 2] * 100003 + r.p[i * 2 + 1], l = nodes.get(k);
      const e = { id: r.id, hw, end, dx: vx / vl, dz: vz / vl, x: r.p[i * 2] / QUANT, z: r.p[i * 2 + 1] / QUANT, major: st.group === 3, rb };
      if (l) l.push(e); else nodes.set(k, [e]);
    }
  }
  // With `oneWayWithin` it answers another question: is (x, z) within that many metres of the carriageway of another
  // one-way main road that runs beside it in the opposite direction to (dirX, dirZ): the other half of a dual road?
  // The segments are bucketed in 32 m cells (each in every cell its widest test can reach): the street edges ask this
  // several times per road sample, and a scan of every segment of a dense chunk made one road a 60 ms step on a phone.
  const CELL = 32, grid = new Map<number, number[]>();
  const cellKey = (x: number, z: number) => (Math.floor(x / CELL) + 64) * 4096 + Math.floor(z / CELL) + 64;
  for (let i = 0; i < lanes.length; i += 7) {
    const pad = lanes[i + 4] + 8.1;
    for (let gz = Math.floor((Math.min(lanes[i + 1], lanes[i + 3]) - pad) / CELL); gz <= Math.floor((Math.max(lanes[i + 1], lanes[i + 3]) + pad) / CELL); gz++)
      for (let gx = Math.floor((Math.min(lanes[i], lanes[i + 2]) - pad) / CELL); gx <= Math.floor((Math.max(lanes[i], lanes[i + 2]) + pad) / CELL); gx++) {
        const k = (gx + 64) * 4096 + gz + 64, l = grid.get(k);
        if (l) l.push(i); else grid.set(k, [i]);
      }
  }
  const onCarriageway = (x: number, z: number, own: number, oneWayWithin = 0, dirX = 0, dirZ = 0): boolean => {
    const cell = grid.get(cellKey(x, z));
    if (!cell) return false;
    for (const i of cell) {
      if (lanes[i + 5] === own || (oneWayWithin && !lanes[i + 6])) continue;
      const ax = lanes[i], az = lanes[i + 1], vx = lanes[i + 2] - ax, vz = lanes[i + 3] - az, hw = lanes[i + 4];
      const l2 = vx * vx + vz * vz;
      let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
      if (oneWayWithin && (t <= 0 || t >= 1 || (vx * dirX + vz * dirZ) / Math.sqrt(l2) > -0.7)) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + vx * t - x, dz = az + vz * t - z;
      const reach = hw + (oneWayWithin || 0.05);
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  };
  for (const r0 of data.roads) {
    yield;
    let r = r0;
    if (v5Exclusion.active) {
      // V5 rendering experiment: a section's carriageway is drawn by the V5 scene.
      const world: number[] = [];
      for (let i = 0; i < r0.p.length; i += 2) world.push(ox + r0.p[i] / QUANT, oz + r0.p[i + 1] / QUANT);
      const kept = v5Exclusion.clipRoad(r0.id, world);
      if (kept === null) continue;
      if (kept) r = { ...r0, p: kept.map((v, i) => Math.round((v - (i % 2 ? oz : ox)) * QUANT)) };
    }
    const type = ROAD_TYPES[r.t];
    const style = ROAD_STYLE[type];
    if (trueRoads && (r.f & ROAD_DEEP_TUNNEL)) continue;
    if (!high && !style.major && !(r.f & 1)) continue;
    const hw = roadWidthCm(r) / QUANT / 2;
    const bridge = (r.f & 1) !== 0 && !!r.e;
    const unifiedAsphalt = trueRoads && !bridge && style.group >= 2;
    const yOff = bridge ? 0 : style.group === 0 ? 0.03 : unifiedAsphalt ? 0.075 : 0.06 + (ROAD_TYPES.length - r.t) * 0.002;
    const pts = samplePolyline(r, ox, oz, ctx, high ? 6 : 24, yOff);
    tmpColor.setHex(unifiedAsphalt ? UNIFIED_ASPHALT : style.color);
    if (type === 'steps') tmpColor.multiplyScalar(0.92);
    ribbon(bufs[unifiedAsphalt ? 3 : style.group], pts, hw, tmpColor, ox, oz, ctx, !bridge, yOff, true);
    if (bridge && !ctx.landmarks.replacesRoadStructure(r.id)) {
      bridgeStructure(structure, pts, hw, ox, oz, ctx, type === 'pier', trueRoads && (r.f & ROAD_SUSPENSION) !== 0);
    }

    // N1-M4: kerb, footpath and the open monsoon drain beside the carriageway, lane lines and stop lines
    // (StreetEdges.ts; all inferred from the road class and width).
    if (high && style.group >= 2 && (style.major || type === 'service') && pts.length >= 2) {
      const cache = new Map<number, ReturnType<typeof offsets>>();
      const off = (d: number) => { let o = cache.get(d); if (!o) cache.set(d, (o = offsets(pts, d))); return o; };
      const blocked = (x: number, z: number, oneWayWithin?: number, dirX?: number, dirZ?: number) => onCarriageway(x, z, r.id, oneWayWithin, dirX, dirZ);
      if (!bridge && !(r.f & 2)) streetEdges(r, type, pts, hw, ox, oz, ctx, { floor: bufs[0], paving: bufs[1], solid: structure }, off, blocked, inIsland);
      const edge = off(hw);
      const edgeY = pts.map((p, i): [number, number] => (bridge ? [p.y, p.y] : [ctx.height.sample(ox + edge[i].lx, oz + edge[i].lz) + yOff, ctx.height.sample(ox + edge[i].rx, oz + edge[i].rz) + yOff]));
      laneMarkings(r, type, pts, hw, marks, off, edgeY, ctx.quality.name === 'low', blocked);
      // (a closed way, a roundabout drawn as one loop, has no end to stop at; roundabout entries use `gwl` give-way lines)
      if (!bridge && !(r.f & 2) && !(trueRoads && (r.f & ROAD_ROUNDABOUT)) && r === r0 && style.major && (r.p[0] !== r.p[r.p.length - 2] || r.p[1] !== r.p[r.p.length - 1])) {
        const n = r.p.length / 2;
        for (const end of [0, 1] as const) {
          const v = end ? n - 1 : 0, allAtNode = nodes.get(r.p[v * 2] * 100003 + r.p[v * 2 + 1]) ?? [];
          if (trueRoads && allAtNode.some((o) => o.rb)) continue; // roundabout entry: give-way line is drawn by `gwl`
          const others = allAtNode.filter((o) => o.id !== r.id);
          const o1 = end ? n - 2 : 1, mx = r.p[o1 * 2] - r.p[v * 2], mz = r.p[o1 * 2 + 1] - r.p[v * 2 + 1], ml = Math.hypot(mx, mz) || 1;
          const me = { dx: mx / ml, dz: mz / ml };
          // Arms at this node besides this one (a way running through counts as two): fewer than two is a bend or
          // the same street under another way id, not a junction.
          const arms = others.reduce((a, o) => a + (o.end ? 1 : 2), 0);
          if (arms < 2) continue;
          // Ways that cross this arm, and whether the street carries straight on under another way id. An arm of the
          // through street stops only at a real crossroads or at a clearly wider road; a side street always stops.
          const cross = others.filter((o) => !o.end || Math.abs(o.dx * me.dx + o.dz * me.dz) < 0.8);
          const crossArms = cross.reduce((a, o) => a + (o.end ? 1 : 2), 0);
          const carriesOn = others.some((o) => o.end && o.dx * me.dx + o.dz * me.dz < -0.8);
          if (!cross.length || (carriesOn && crossArms < 2 && !cross.some((o) => o.hw > hw * 1.15))) continue;
          stopLine(r, pts, hw, end, Math.max(...cross.map((o) => o.hw)), marks);
        }
      }
    }
  }
  // N2-M2 (?roads=1): kerbed roundabout islands, splitter/gore islands, dual-carriageway medians, give-way lines,
  // junction kerb corner radii, and underground road tunnel portals.
  if (trueRoads && high) {
    const lowQ = ctx.quality.name === 'low';
    if (data.rbi?.length) buildKerbedPolys(data.rbi, ox, oz, ctx, structure, bufs[0], true, lowQ);
    if (data.med?.length) buildKerbedPolys(data.med, ox, oz, ctx, structure, bufs[0], true, lowQ);
    if (data.spl?.length) buildKerbedPolys(data.spl, ox, oz, ctx, structure, bufs[0], false, lowQ);

    // Give-way lines + yield triangles at every roundabout entry.
    const gwl = data.gwl ?? [];
    for (let i = 0; i + 3 < gwl.length; i += 4) {
      const ax = gwl[i] / QUANT, az = gwl[i + 1] / QUANT, bx = gwl[i + 2] / QUANT, bz = gwl[i + 3] / QUANT;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1.0) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // Forward toward roundabout ring:
      const fx = -uz, fz = ux;
      // Double dashed give-way teeth across the entry lanes.
      for (const rowOff of [0, -0.34]) {
        for (let s = 0.1; s + 0.5 <= len; s += 0.9) {
          const s1 = Math.min(len - 0.05, s + 0.55);
          const x0 = ax + ux * s + fx * rowOff, z0 = az + uz * s + fz * rowOff;
          const x1 = ax + ux * s1 + fx * rowOff, z1 = az + uz * s1 + fz * rowOff;
          const y0 = ctx.height.sample(ox + x0, oz + z0) + 0.1, y1 = ctx.height.sample(ox + x1, oz + z1) + 0.1;
          const v0 = marks.vert(x0, y0, z0, ...UP, PAINT_WHITE);
          const v1 = marks.vert(x1, y1, z1, ...UP, PAINT_WHITE);
          const v2 = marks.vert(x1 + fx * 0.18, y1, z1 + fz * 0.18, ...UP, PAINT_WHITE);
          const v3 = marks.vert(x0 + fx * 0.18, y0, z0 + fz * 0.18, ...UP, PAINT_WHITE);
          marks.triUp(v0, v1, v2); marks.triUp(v0, v2, v3);
        }
      }
      // Hollow white yield triangle 2.6 m back in the middle of the approach lane.
      if (!lowQ) {
        const mx = (ax + bx) * 0.5 - fx * 2.6, mz = (az + bz) * 0.5 - fz * 2.6;
        const my = ctx.height.sample(ox + mx, oz + mz) + 0.1;
        const tip: [number, number] = [mx - fx * 1.15, mz - fz * 1.15];
        const bL: [number, number] = [mx + fx * 0.95 - ux * 0.62, mz + fz * 0.95 - uz * 0.62];
        const bR: [number, number] = [mx + fx * 0.95 + ux * 0.62, mz + fz * 0.95 + uz * 0.62];
        const seg = (p: [number, number], q: [number, number], hwS: number) => {
          const sx = q[0] - p[0], sz = q[1] - p[1], sl = Math.hypot(sx, sz) || 1;
          const nx = (-sz / sl) * hwS, nz = (sx / sl) * hwS;
          const v0 = marks.vert(p[0] - nx, my, p[1] - nz, ...UP, PAINT_WHITE);
          const v1 = marks.vert(p[0] + nx, my, p[1] + nz, ...UP, PAINT_WHITE);
          const v2 = marks.vert(q[0] + nx, my, q[1] + nz, ...UP, PAINT_WHITE);
          const v3 = marks.vert(q[0] - nx, my, q[1] - nz, ...UP, PAINT_WHITE);
          marks.triUp(v0, v1, v2); marks.triUp(v0, v2, v3);
        };
        seg(bL, bR, 0.065); seg(bR, tip, 0.065); seg(tip, bL, 0.065);
      }
    }

    // Junction kerb corner radii & flared asphalt fillets at street intersections.
    tmpColor.setHex(UNIFIED_ASPHALT);
    for (const list of nodes.values()) {
      if (list.length < 2 || list.some((e) => e.rb)) continue;
      // Expand non-endpoint ways passing straight through into two opposite rays.
      const rays: { dx: number; dz: number; hw: number; major: boolean; id: number; x: number; z: number }[] = [];
      for (const e of list) {
        rays.push({ dx: e.dx, dz: e.dz, hw: e.hw, major: e.major, id: e.id, x: e.x, z: e.z });
        if (!e.end) rays.push({ dx: -e.dx, dz: -e.dz, hw: e.hw, major: e.major, id: e.id, x: e.x, z: e.z });
      }
      if (new Set(rays.map((r) => r.id)).size < 2) continue;
      rays.sort((a, b) => Math.atan2(a.dz, a.dx) - Math.atan2(b.dz, b.dx));
      for (let i = 0; i < rays.length; i++) {
        const A = rays[i], B = rays[(i + 1) % rays.length];
        if (A.id === B.id) continue;
        let dAng = Math.atan2(B.dz, B.dx) - Math.atan2(A.dz, A.dx);
        if (dAng <= 0) dAng += Math.PI * 2;
        if (dAng < 0.62 || dAng > 2.52) continue; // fillet ~35..145 deg street corners
        const R = A.major && B.major ? 3.8 : 2.4;
        // Left normal of A is (-A.dz, A.dx); right normal of B is (B.dz, -B.dx).
        const nAx = -A.dz, nAz = A.dx, nBx = B.dz, nBz = -B.dx;
        // Solve intersection of offset lines: P_A = node + nA*(hwA + R) + t*dA, P_B = node + nB*(hwB + R) + u*dB.
        const det = A.dx * B.dz - A.dz * B.dx;
        if (Math.abs(det) < 0.25) continue;
        const rhsX = nBx * (B.hw + R) - nAx * (A.hw + R), rhsZ = nBz * (B.hw + R) - nAz * (A.hw + R);
        const t = (rhsX * B.dz - rhsZ * B.dx) / det;
        if (t < 0.5 || t > 22) continue;
        const cxF = A.x + nAx * (A.hw + R) + A.dx * t, czF = A.z + nAz * (A.hw + R) + A.dz * t;
        if (cxF < 1 || czF < 1 || cxF > CHUNK_SIZE - 1 || czF > CHUNK_SIZE - 1) continue;
        if (v5Exclusion.active && v5Exclusion.inCorridor(ox + cxF, oz + czF)) continue;
        // Corner vertex where road edges (without R) meet:
        const rhs0X = nBx * B.hw - nAx * A.hw, rhs0Z = nBz * B.hw - nAz * A.hw;
        const t0 = (rhs0X * B.dz - rhs0Z * B.dx) / det;
        const vxC = A.x + nAx * A.hw + A.dx * t0, vzC = A.z + nAz * A.hw + A.dz * t0;
        if (inIsland?.(vxC, vzC) || ctx.collision.insideBuilding(ox + vxC, oz + vzC, ctx.height.sample(ox + vxC, oz + vzC) + 1, false)) continue;
        const a0 = Math.atan2(-nAz, -nAx), a1 = Math.atan2(-nBz, -nBx);
        let sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        while (sweep < -Math.PI) sweep += Math.PI * 2;
        if (Math.abs(sweep) > Math.PI * 0.85) continue;
        const SEGS = lowQ ? 2 : 3;
        const cVert = bufs[3].vert(vxC, ctx.height.sample(ox + vxC, oz + vzC) + 0.075, vzC, ...UP, tmpColor);
        let prevAsph = -1, prevKx = 0, prevKz = 0;
        const kTop = A.major || B.major ? KERB_H : 0.07;
        for (let k = 0; k <= SEGS; k++) {
          const ang = a0 + (sweep * k) / SEGS;
          const px = cxF + Math.cos(ang) * R, pz = czF + Math.sin(ang) * R;
          const py = ctx.height.sample(ox + px, oz + pz);
          const av = bufs[3].vert(px, py + 0.075, pz, ...UP, tmpColor);
          if (prevAsph >= 0) bufs[3].triUp(cVert, prevAsph, av);
          if (k > 0) {
            quad(structure, prevKx, ctx.height.sample(ox + prevKx, oz + prevKz), ctx.height.sample(ox + prevKx, oz + prevKz) + kTop, prevKz, px, py, py + kTop, pz, KERB_STONE);
            const ox0 = cxF + Math.cos(a0 + (sweep * (k - 1)) / SEGS) * (R - 0.16), oz0 = czF + Math.sin(a0 + (sweep * (k - 1)) / SEGS) * (R - 0.16);
            const ox1 = cxF + Math.cos(ang) * (R - 0.16), oz1 = czF + Math.sin(ang) * (R - 0.16);
            const kv0 = structure.vert(prevKx, ctx.height.sample(ox + prevKx, oz + prevKz) + kTop, prevKz, ...UP, KERB_STONE);
            const kv1 = structure.vert(px, py + kTop, pz, ...UP, KERB_STONE);
            const kv2 = structure.vert(ox1, ctx.height.sample(ox + ox1, oz + oz1) + kTop, oz1, ...UP, KERB_STONE);
            const kv3 = structure.vert(ox0, ctx.height.sample(ox + ox0, oz + oz0) + kTop, oz0, ...UP, KERB_STONE);
            structure.triUp(kv0, kv1, kv2); structure.triUp(kv0, kv2, kv3);
          }
          prevAsph = av; prevKx = px; prevKz = pz;
        }
      }
    }

    // Underground road tunnel portals (`tpr`, e.g. Bulatan Abang Kipali trunk underpass).
    const tpr = data.tpr ?? [];
    for (let i = 0; i + 5 < tpr.length; i += 6) {
      const px = tpr[i] / QUANT, pz = tpr[i + 1] / QUANT;
      const dx = tpr[i + 2] / 1000, dz = tpr[i + 3] / 1000;
      const hwP = tpr[i + 4] / QUANT, lenP = tpr[i + 5] / QUANT;
      const nx = -dz, nz = dx;
      const g0 = ctx.height.sample(ox + px, oz + pz);
      const ex = px + dx * lenP, ez = pz + dz * lenP, g1 = ctx.height.sample(ox + ex, oz + ez);
      const deepY = g1 - 2.6;
      // Sloping asphalt ramp into portal throat:
      const r0L = bufs[3].vert(px + nx * hwP, g0 + 0.075, pz + nz * hwP, ...UP, tmpColor);
      const r0R = bufs[3].vert(px - nx * hwP, g0 + 0.075, pz - nz * hwP, ...UP, tmpColor);
      const r1L = bufs[3].vert(ex + nx * hwP, deepY, ez + nz * hwP, ...UP, TUNNEL_THROAT);
      const r1R = bufs[3].vert(ex - nx * hwP, deepY, ez - nz * hwP, ...UP, TUNNEL_THROAT);
      bufs[3].triUp(r0L, r0R, r1R); bufs[3].triUp(r0L, r1R, r1L);
      // Retaining walls & headwall parapet:
      for (const sgn of [-1, 1]) {
        const wx0 = px + nx * (hwP + 0.15) * sgn, wz0 = pz + nz * (hwP + 0.15) * sgn;
        const wx1 = ex + nx * (hwP + 0.15) * sgn, wz1 = ez + nz * (hwP + 0.15) * sgn;
        quad(structure, wx0, g0 - 0.1, g0 + 0.95, wz0, wx1, deepY, g1 + 0.95, wz1, CONCRETE);
      }
      quad(structure, ex - nx * (hwP + 0.2), g1 - 0.4, g1 + 1.05, ez - nz * (hwP + 0.2), ex + nx * (hwP + 0.2), g1 - 0.4, g1 + 1.05, ez + nz * (hwP + 0.2), CONCRETE);
      quad(structure, ex - nx * hwP, deepY, g1 - 0.4, ez - nz * hwP, ex + nx * hwP, deepY, g1 - 0.4, ez + nz * hwP, TUNNEL_THROAT);
    }
  }
  // N1-M5: the paved riverside walk of the Kuching Waterfront and the Square Tower apron (district/PromenadeMesh.ts).
  if (high && m5Enabled() && stationOfChunk(data)) buildPromenadePaving(data, ctx, bufs[1]);
  // N2-M0b: street-level props of India Street (stalls, awnings, flags, Gambier parked cars) and City Mosque graves
  // go into a near-detail buffer culled beyond ~145 m / ~130 m so neighbouring chunks stay within the +12 % guide.
  const nearBuf = new GeoBuf();
  let nearMeta: { x: number; z: number; maxDist: number } | undefined;
  // N1-M5 place 3: India Street's paving, canopy, stalls and flags, and Jalan Gambier's parked cars (district/IndiaStreetMesh.ts).
  if (high) {
    buildIndiaStreet(data, ctx, bufs[1], marks, structure, nearBuf);
    if (nearBuf.count > 0) nearMeta = { x: -110, z: -155, maxDist: 150 };
  }
  // N1-M5 place 4: the entrance of Plaza Merdeka (district/PlazaMesh.ts).
  if (high) buildPlazaEntrance(data, ctx, bufs[1], structure);
  // N1-M5 place 5: fascia boards, awnings and kapcai of the Jalan Padungan rows (district/PadunganMesh.ts).
  if (high) buildPadungan(data, ctx, structure);
  // N1-M5 place 6: the graves of the cemetery beside the Kuching City Mosque (district/GravesMesh.ts).
  if (high) {
    const before = nearBuf.count;
    buildGraves(data, ctx, nearBuf);
    if (nearBuf.count > before && !nearMeta) nearMeta = { x: -410, z: 20, maxDist: 135 };
  }
  // Polygon decks (piers mapped as areas)
  for (const d of data.pdecks) {
    const y = d.h / QUANT;
    const flat: number[] = [];
    for (let i = 0; i < d.r.length; i += 2) flat.push(d.r[i] / QUANT, d.r[i + 1] / QUANT);
    const ids = THREE.ShapeUtils.triangulateShape(toVec2(flat), []);
    tmpColor.setHex(ROAD_STYLE.pier.color);
    const base = bufs[1].count;
    for (let i = 0; i < flat.length; i += 2) bufs[1].vert(flat[i], y, flat[i + 1], ...UP, tmpColor);
    for (let t of ids) bufs[1].triUp(base + t[0], base + t[1], base + t[2]);
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(structure, flat[i * 2], y - 2.2, y, flat[i * 2 + 1], flat[j * 2], y - 2.2, y, flat[j * 2 + 1], CONCRETE);
    }
  }
  yield;
  const nearGeo = nearBuf.build();
  return { groups: bufs.map((b) => b.build()), marks: marks.build(), near: nearGeo && nearMeta ? { geo: nearGeo, ...nearMeta } : undefined };
}

export function toVec2(flat: number[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector2(flat[i], flat[i + 1]));
  return out;
}

/** Vertical quay walls along the mapped river bank. */
export function buildShore(data: ChunkData, ctx: BuildContext, structure: GeoBuf): void {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  for (const line of data.shore) {
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2] / QUANT, az = line[i - 1] / QUANT, bx = line[i] / QUANT, bz = line[i + 1] / QUANT;
      quad(structure, ax, WATER_LEVEL - 1.2, ctx.height.sample(ox + ax, oz + az), az, bx, WATER_LEVEL - 1.2, ctx.height.sample(ox + bx, oz + bz), bz, QUAY);
    }
  }
  if (ctx.detail !== 'high') return;
  // Promenade railing on the stretches of river bank flagged by the streetscape pass.
  // N1-M5: within reach of Main Bazaar the bank carries the Waterfront's ring-panel railing instead.
  const lines: number[][] = [];
  for (const line of data.rail ?? []) {
    if (!(m5Enabled() && stationOfChunk(data))) { lines.push(line); continue; }
    let run: number[] = [], kind = false;
    for (let i = 2; i < line.length; i += 2) {
      const ring = ringRailingAt(ox + (line[i - 2] + line[i]) / 2 / QUANT, oz + (line[i - 1] + line[i + 1]) / 2 / QUANT);
      if (run.length && ring !== kind) { if (kind) ringRailing(structure, run, (x, z) => ctx.height.sample(ox + x, oz + z), ctx.quality.name !== 'low'); else lines.push(run); run = []; }
      if (!run.length) run.push(line[i - 2], line[i - 1]);
      run.push(line[i], line[i + 1]); kind = ring;
    }
    if (run.length) { if (kind) ringRailing(structure, run, (x, z) => ctx.height.sample(ox + x, oz + z), ctx.quality.name !== 'low'); else lines.push(run); }
  }
  for (const line of lines) {
    let acc = 0, next = 0;
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2] / QUANT, az = line[i - 1] / QUANT, bx = line[i] / QUANT, bz = line[i + 1] / QUANT;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ya = ctx.height.sample(ox + ax, oz + az), yb = ctx.height.sample(ox + bx, oz + bz);
      for (const [lo, hi] of [[1.0, 1.07], [0.52, 0.56], [0.12, 0.16]]) quad(structure, ax, ya + lo, ya + hi, az, bx, yb + lo, yb + hi, bz, RAIL_PAINT);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      while (next <= acc + len) {
        const t = (next - acc) / len;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t;
        quad(structure, x - dx * 0.05, y, y + 1.1, z - dz * 0.05, x + dx * 0.05, y, y + 1.1, z + dz * 0.05, RAIL_PAINT);
        quad(structure, x + dz * 0.05, y, y + 1.1, z - dx * 0.05, x - dz * 0.05, y, y + 1.1, z + dx * 0.05, RAIL_PAINT);
        next += 2.4;
      }
      acc += len;
    }
  }
}
