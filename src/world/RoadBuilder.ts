import * as THREE from 'three';
import { v5Exclusion } from '../v5/geo.ts';
import { CHUNK_SIZE, QUANT, WATER_LEVEL } from './config.ts';
import type { ChunkData, RoadData } from './types.ts';
import { ROAD_TYPES, ROAD_STYLE } from './types.ts';
import { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';
import { streetEdges, laneMarkings, stopLine } from './StreetEdges.ts';
import { m5Enabled } from './district/m5.ts';
import { stationOfChunk } from './district/props.ts';
import { buildPromenadePaving, ringRailing, ringRailingAt } from './district/PromenadeMesh.ts';
import { buildIndiaStreet } from './district/IndiaStreetMesh.ts';

const UP = [0, 1, 0] as const;
const tmpColor = new THREE.Color();
const RAIL = new THREE.Color(0xc9ccd0);
const CONCRETE = new THREE.Color(0x9a968c);
const QUAY = new THREE.Color(0x8b8578);
const RAIL_PAINT = new THREE.Color(0x3d4a52);

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

/** Deck sides, railings and piers for a bridge road. */
function bridgeStructure(buf: GeoBuf, pts: Sample[], hw: number, ox: number, oz: number, ctx: BuildContext, pier: boolean): void {
  const off = offsets(pts, hw);
  let dist = 0, nextPost = 0, nextPier = 14;
  for (let i = 1; i < pts.length; i++) {
    const a = off[i - 1], b = off[i], pa = pts[i - 1], pb = pts[i];
    const thick = pier ? 0.3 : 0.55;
    for (const side of [0, 1]) {
      const ax = side ? a.rx : a.lx, az = side ? a.rz : a.lz, bx = side ? b.rx : b.lx, bz = side ? b.rz : b.lz;
      quad(buf, ax, pa.y - thick, pa.y, az, bx, pb.y - thick, pb.y, bz, CONCRETE);
      if (!pier) {
        quad(buf, ax, pa.y + 1.02, pa.y + 1.1, az, bx, pb.y + 1.02, pb.y + 1.1, bz, RAIL);
        quad(buf, ax, pa.y + 0.5, pa.y + 0.56, az, bx, pb.y + 0.5, pb.y + 0.56, bz, RAIL);
      }
    }
    // underside
    const u0 = buf.vert(a.lx, pa.y - thick, a.lz, 0, -1, 0, CONCRETE), u1 = buf.vert(a.rx, pa.y - thick, a.rz, 0, -1, 0, CONCRETE);
    const u2 = buf.vert(b.rx, pb.y - thick, b.rz, 0, -1, 0, CONCRETE), u3 = buf.vert(b.lx, pb.y - thick, b.lz, 0, -1, 0, CONCRETE);
    buf.tri(u0, u1, u2); buf.tri(u0, u2, u3);

    const segLen = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    if (segLen < 1e-4) continue;
    const dx = (pb.x - pa.x) / segLen, dz = (pb.z - pa.z) / segLen;
    while (!pier && nextPost <= dist + segLen) {
      const t = (nextPost - dist) / segLen;
      const y = pa.y + (pb.y - pa.y) * t;
      for (const s of [-1, 1]) {
        const cx = pa.x + (pb.x - pa.x) * t - dz * hw * s, cz = pa.z + (pb.z - pa.z) * t + dx * hw * s;
        quad(buf, cx - dx * 0.04, y, y + 1.1, cz - dz * 0.04, cx + dx * 0.04, y, y + 1.1, cz + dz * 0.04, RAIL);
      }
      nextPost += 2.5;
    }
    while (nextPier <= dist + segLen) {
      const t = (nextPier - dist) / segLen;
      const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t, y = pa.y + (pb.y - pa.y) * t - thick;
      const ground = ctx.collision.inWater(ox + x, oz + z) ? WATER_LEVEL - 1.5 : ctx.height.sample(ox + x, oz + z);
      if (y - ground > 1.2) {
        const r = pier ? 0.18 : Math.min(0.7, hw * 0.35);
        const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
        for (let k = 0; k < 4; k++) {
          const p = c[k], n = c[(k + 1) % 4];
          quad(buf, x + p[0], ground, y, z + p[1], x + n[0], ground, y, z + n[1], CONCRETE);
        }
      }
      nextPier += pier ? 6 : 28;
    }
    dist += segLen;
  }
}

export interface RoadMeshes { groups: (THREE.BufferGeometry | null)[]; marks: THREE.BufferGeometry | null; structure: GeoBuf }

/**
 * Road ribbons (grouped by draw layer), lane markings, and bridge structures for a chunk. A generator: it yields
 * between roads so that ChunkManager can spread a heavy chunk over several frames (V8.2); the result is the same.
 */
export function* buildRoads(data: ChunkData, ctx: BuildContext, structure: GeoBuf): Generator<void, { groups: (THREE.BufferGeometry | null)[]; marks: THREE.BufferGeometry | null }> {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const high = ctx.detail === 'high';
  const bufs = [new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf()];
  const marks = new GeoBuf();
  // Carriageway segments of this chunk (chunk-local metres) for the kerb clearance test.
  const lanes: number[] = [];
  for (const r of data.roads) {
    const st = ROAD_STYLE[ROAD_TYPES[r.t]];
    if (!high || st.group < 2) continue;
    for (let i = 2; i < r.p.length; i += 2) lanes.push(r.p[i - 2] / QUANT, r.p[i - 1] / QUANT, r.p[i] / QUANT, r.p[i + 1] / QUANT, r.w / QUANT / 2, r.id, st.group === 3 && r.f & 8 ? 1 : 0);
  }
  // Vertices of the drivable roads of this chunk (for stop lines): who passes through each, and whether it ends there.
  // For an end, (dx, dz) is the unit direction in which that road leaves the vertex.
  const nodes = new Map<number, { id: number; hw: number; end: boolean; dx: number; dz: number }[]>();
  if (high) for (const r of data.roads) {
    const st = ROAD_STYLE[ROAD_TYPES[r.t]];
    if (st.group < 2 || !st.major || r.f & 3) continue;
    const n = r.p.length / 2;
    for (let i = 0; i < n; i++) {
      const end = i === 0 || i === n - 1, o = i === 0 ? 1 : i - 1;
      const vx = r.p[o * 2] - r.p[i * 2], vz = r.p[o * 2 + 1] - r.p[i * 2 + 1], vl = Math.hypot(vx, vz) || 1;
      const k = r.p[i * 2] * 100003 + r.p[i * 2 + 1], l = nodes.get(k), e = { id: r.id, hw: r.w / QUANT / 2, end, dx: vx / vl, dz: vz / vl };
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
    if (!high && !style.major && !(r.f & 1)) continue;
    const hw = r.w / QUANT / 2;
    const bridge = (r.f & 1) !== 0 && !!r.e;
    const yOff = bridge ? 0 : style.group === 0 ? 0.03 : 0.06 + (ROAD_TYPES.length - r.t) * 0.002;
    const pts = samplePolyline(r, ox, oz, ctx, high ? 6 : 24, yOff);
    tmpColor.setHex(style.color);
    if (type === 'steps') tmpColor.multiplyScalar(0.92);
    ribbon(bufs[style.group], pts, hw, tmpColor, ox, oz, ctx, !bridge, yOff, true);
    if (bridge && !ctx.landmarks.replacesRoadStructure(r.id)) bridgeStructure(structure, pts, hw, ox, oz, ctx, type === 'pier');

    // N1-M4: kerb, footpath and the open monsoon drain beside the carriageway, lane lines and stop lines
    // (StreetEdges.ts; all inferred from the road class and width).
    if (high && style.group >= 2 && (style.major || type === 'service') && pts.length >= 2) {
      const cache = new Map<number, ReturnType<typeof offsets>>();
      const off = (d: number) => { let o = cache.get(d); if (!o) cache.set(d, (o = offsets(pts, d))); return o; };
      const blocked = (x: number, z: number, oneWayWithin?: number, dirX?: number, dirZ?: number) => onCarriageway(x, z, r.id, oneWayWithin, dirX, dirZ);
      if (!bridge && !(r.f & 2)) streetEdges(r, type, pts, hw, ox, oz, ctx, { floor: bufs[0], paving: bufs[1], solid: structure }, off, blocked);
      const edge = off(hw);
      const edgeY = pts.map((p, i): [number, number] => (bridge ? [p.y, p.y] : [ctx.height.sample(ox + edge[i].lx, oz + edge[i].lz) + yOff, ctx.height.sample(ox + edge[i].rx, oz + edge[i].rz) + yOff]));
      laneMarkings(r, type, pts, hw, marks, off, edgeY, ctx.quality.name === 'low', blocked);
      // (a closed way, a roundabout drawn as one loop, has no end to stop at)
      if (!bridge && !(r.f & 2) && r === r0 && style.major && (r.p[0] !== r.p[r.p.length - 2] || r.p[1] !== r.p[r.p.length - 1])) {
        const n = r.p.length / 2;
        for (const end of [0, 1] as const) {
          const v = end ? n - 1 : 0, others = (nodes.get(r.p[v * 2] * 100003 + r.p[v * 2 + 1]) ?? []).filter((o) => o.id !== r.id);
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
  // N1-M5: the paved riverside walk of the Kuching Waterfront and the Square Tower apron (district/PromenadeMesh.ts).
  if (high && m5Enabled() && stationOfChunk(data)) buildPromenadePaving(data, ctx, bufs[1]);
  // N1-M5 place 3: India Street's paving, canopy, stalls and flags, and Jalan Gambier's parked cars (district/IndiaStreetMesh.ts).
  if (high) buildIndiaStreet(data, ctx, bufs[1], marks, structure);
  // Polygon decks (piers mapped as areas)
  for (const d of data.pdecks) {
    const y = d.h / QUANT;
    const flat: number[] = [];
    for (let i = 0; i < d.r.length; i += 2) flat.push(d.r[i] / QUANT, d.r[i + 1] / QUANT);
    const ids = THREE.ShapeUtils.triangulateShape(toVec2(flat), []);
    tmpColor.setHex(ROAD_STYLE.pier.color);
    const base = bufs[1].count;
    for (let i = 0; i < flat.length; i += 2) bufs[1].vert(flat[i], y, flat[i + 1], ...UP, tmpColor);
    for (const t of ids) bufs[1].triUp(base + t[0], base + t[1], base + t[2]);
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(structure, flat[i * 2], y - 2.2, y, flat[i * 2 + 1], flat[j * 2], y - 2.2, y, flat[j * 2 + 1], CONCRETE);
    }
  }
  yield;
  return { groups: bufs.map((b) => b.build()), marks: marks.build() };
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
