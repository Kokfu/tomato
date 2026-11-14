import * as THREE from 'three';
import { CHUNK_SIZE, QUANT, WATER_LEVEL } from './config.ts';
import type { ChunkData, RoadData } from './types.ts';
import { ROAD_TYPES, ROAD_STYLE } from './types.ts';
import { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';

const UP = [0, 1, 0] as const;
const tmpColor = new THREE.Color();
const RAIL = new THREE.Color(0xc9ccd0);
const CONCRETE = new THREE.Color(0x9a968c);
const QUAY = new THREE.Color(0x8b8578);

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

/** Road ribbons (grouped by draw layer), lane markings, and bridge structures for a chunk. */
export function buildRoads(data: ChunkData, ctx: BuildContext, structure: GeoBuf): { groups: (THREE.BufferGeometry | null)[]; marks: THREE.BufferGeometry | null } {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const high = ctx.detail === 'high';
  const bufs = [new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf()];
  const marks = new GeoBuf();
  const white = new THREE.Color(0xffffff);
  for (const r of data.roads) {
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
    if (bridge) bridgeStructure(structure, pts, hw, ox, oz, ctx, type === 'pier');

    // Dashed centre line on two-way major roads (decorative, inferred - not mapped lane data).
    if (high && style.group === 3 && !(r.f & 8) && hw >= 3) {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-3) continue;
        const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
        let s = (9 - (acc % 9)) % 9;
        for (; s + 3 <= len; s += 9) {
          const x0 = a.x + dx * s, z0 = a.z + dz * s, x1 = x0 + dx * 3, z1 = z0 + dz * 3;
          const y0 = a.y + ((b.y - a.y) * s) / len + 0.02, y1 = a.y + ((b.y - a.y) * (s + 3)) / len + 0.02;
          const w = 0.07;
          const v0 = marks.vert(x0 - dz * w, y0, z0 + dx * w, ...UP, white), v1 = marks.vert(x0 + dz * w, y0, z0 - dx * w, ...UP, white);
          const v2 = marks.vert(x1 + dz * w, y1, z1 - dx * w, ...UP, white), v3 = marks.vert(x1 - dz * w, y1, z1 + dx * w, ...UP, white);
          marks.triUp(v0, v1, v2); marks.triUp(v0, v2, v3);
        }
        acc += len;
      }
    }
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
    for (const t of ids) bufs[1].triUp(base + t[0], base + t[1], base + t[2]);
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(structure, flat[i * 2], y - 2.2, y, flat[i * 2 + 1], flat[j * 2], y - 2.2, y, flat[j * 2 + 1], CONCRETE);
    }
  }
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
}
