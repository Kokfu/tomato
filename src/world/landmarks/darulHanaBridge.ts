// Darul Hana Bridge - APPROXIMATE procedural model.
// Mapped (OSM): deck centre lines of the ways below, deck width, the two spur ways (viewing
// platforms). From the data pipeline (inferred): deck elevations (RoadData.e).
// Approximated from public descriptions: two outward-inclined steel masts (64 m long, published;
// 48 degree inclination, published without reference direction - taken from horizontal), one-sided
// stay-cable fans, tubular truss under the deck (1.62 m deep, published), railings, piers.
// The mast bases are placed just beyond the mapped spur ends and lean along the mapped spur
// direction; the hornbill-style mast heads are stylised.
import { CHUNK_SIZE, QUANT, WATER_LEVEL } from '../config.ts';
import type { RoadData } from '../types.ts';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, chunkWaterTest, type V3 } from './kit.ts';

const MAIN = 568501299;
const APPROACH = [634697570, 779037132];
const SPURS = [779315127, 779315128];
export const DARUL_HANA_WAYS = [MAIN, ...APPROACH, ...SPURS];

const STEEL = col(0xe9ecee);
const STEEL_DARK = col(0xd2d7da);
const RAIL = col(0xd5dadd);
const CONCRETE = col(0xa7a39a);
const CABLE = col(0xf2f2ee);
const BEAK = col(0xe6b33c);
const CASQUE = col(0xd98a2b);

const MAST_LENGTH = 64; // published (schlaich bergermann partner)
const MAST_ELEVATION = (48 * Math.PI) / 180; // published inclination, interpreted from horizontal
const TRUSS_DEPTH = 1.62; // published superstructure depth

interface P { x: number; z: number; y: number }
interface Piece { id: number; hw: number; raw: P[]; pts: P[]; left: P[]; right: P[] }

function toPiece(r: RoadData): Piece {
  const raw: P[] = [];
  for (let i = 0; i < r.p.length / 2; i++) raw.push({ x: r.p[i * 2] / QUANT, z: r.p[i * 2 + 1] / QUANT, y: r.e![i] / QUANT });
  // Resample on the same polyline (the walkable ribbon is linear between mapped vertices).
  const pts: P[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
    for (let s = 1; s <= steps; s++) pts.push({ x: a.x + ((b.x - a.x) * s) / steps, z: a.z + ((b.z - a.z) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  const hw = r.w / QUANT / 2;
  const left: P[] = [], right: P[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    let d1x = b.x - a.x, d1z = b.z - a.z, d2x = c.x - b.x, d2z = c.z - b.z;
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    if (l1 > 1e-6) { d1x /= l1; d1z /= l1; } else { d1x = d2x / (l2 || 1); d1z = d2z / (l2 || 1); }
    if (l2 > 1e-6) { d2x /= l2; d2z /= l2; } else { d2x = d1x; d2z = d1z; }
    let nx = -(d1z + d2z), nz = d1x + d2x;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) { nx = -d1z; nz = d1x; } else { nx /= nl; nz /= nl; }
    const m = hw / Math.max(0.45, nx * -d1z + nz * d1x);
    left.push({ x: b.x + nx * m, z: b.z + nz * m, y: b.y });
    right.push({ x: b.x - nx * m, z: b.z - nz * m, y: b.y });
  }
  return { id: r.id, hw, raw, pts, left, right };
}

function distToPolyline(x: number, z: number, pts: P[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, vx = pts[i].x - ax, vz = pts[i].z - az;
    const l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
}

const v3 = (p: P, dy = 0): V3 => [p.x, p.y + dy, p.z];
const lerpP = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });

/** Position and tangent at arc length s along a polyline (clamped); null beyond the ends. */
function along(pts: P[], s: number): { p: P; tx: number; tz: number } | null {
  if (s < 0) return null;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (s <= l && l > 1e-6) return { p: lerpP(pts[i - 1], pts[i], s / l), tx: (pts[i].x - pts[i - 1].x) / l, tz: (pts[i].z - pts[i - 1].z) / l };
    s -= l;
  }
  return null;
}

function railings(m: Model, piece: Piece, others: Piece[]): void {
  // A stretch of railing is left out where it would cross another deck of the bridge (junctions).
  const blocked = (p: P) => others.some((o) => distToPolyline(p.x, p.z, o.pts) < o.hw - 0.15);
  for (const edge of [piece.left, piece.right]) {
    let post = 0;
    for (let i = 1; i < edge.length; i++) {
      const a = edge[i - 1], b = edge[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-3) continue;
      const sub = Math.max(1, Math.ceil(len / 0.5));
      let runStart = -1;
      for (let k = 0; k <= sub; k++) {
        const open = k < sub && !blocked(lerpP(a, b, (k + 0.5) / sub));
        if (open && runStart < 0) runStart = k;
        if (!open && runStart >= 0) {
          const p = lerpP(a, b, runStart / sub), q = lerpP(a, b, k / sub);
          const c = piece.pts[i];
          const ref: V3 = [c.x, c.y + 0.6, c.z];
          m.poly([v3(p, 1.12), v3(q, 1.12), v3(q, 1.2), v3(p, 1.2)], RAIL, ref);
          m.poly([v3(p, 0.72), v3(q, 0.72), v3(q, 0.76), v3(p, 0.76)], RAIL, ref);
          m.poly([v3(p, 0.36), v3(q, 0.36), v3(q, 0.4), v3(p, 0.4)], RAIL, ref);
          runStart = -1;
        }
      }
      // stanchions every 2 m of edge length
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      for (; post <= len; post += 2) {
        const p = lerpP(a, b, post / len);
        if (blocked(p)) continue;
        const c = piece.pts[i];
        m.poly([[p.x - dx * 0.04, p.y, p.z - dz * 0.04], [p.x + dx * 0.04, p.y, p.z + dz * 0.04], [p.x + dx * 0.04, p.y + 1.2, p.z + dz * 0.04], [p.x - dx * 0.04, p.y + 1.2, p.z - dz * 0.04]], RAIL, [c.x, c.y + 0.6, c.z]);
      }
      post -= len;
    }
  }
}

function deckStructure(m: Model, piece: Piece): void {
  const { pts, left, right } = piece;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ref: V3 = [(a.x + b.x) / 2, (a.y + b.y) / 2 - 0.5, (a.z + b.z) / 2];
    for (const e of [left, right]) {
      // slab edge / kerb, then the inclined truss face down to the bottom chord
      m.poly([v3(e[i - 1], -0.3), v3(e[i], -0.3), v3(e[i], 0.1), v3(e[i - 1], 0.1)], STEEL, ref);
      m.poly([v3(e[i - 1], -0.3), v3(e[i], -0.3), v3(b, -TRUSS_DEPTH), v3(a, -TRUSS_DEPTH)], STEEL_DARK, ref);
    }
  }
  // close the truss at free ends
  for (const i of [0, pts.length - 1]) m.poly([v3(left[i], -0.3), v3(right[i], -0.3), v3(pts[i], -TRUSS_DEPTH)], STEEL_DARK);
}

export const buildDarulHanaBridge: LandmarkBuilder = ({ data, ctx }) => {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const pieces = data.roads.filter((r) => DARUL_HANA_WAYS.includes(r.id) && r.e && r.p.length >= 4).map(toPiece);
  if (!pieces.length) return null;
  const inWater = chunkWaterTest(data);
  const m = new Model().world();

  for (const piece of pieces) {
    deckStructure(m, piece);
    railings(m, piece, pieces.filter((o) => o !== piece));
  }

  // Columns under the land sections (approach ramp and spiral); the river spans hang from the masts.
  for (const piece of pieces) {
    if (SPURS.includes(piece.id)) continue;
    for (let s = 7; ; s += 14) {
      const q = along(piece.pts, s);
      if (!q) break;
      if (inWater(q.p.x, q.p.z)) continue;
      const ground = ctx.height.sample(ox + q.p.x, oz + q.p.z);
      if (q.p.y - TRUSS_DEPTH - ground < 1.0) continue;
      m.tube([q.p.x, ground - 0.4, q.p.z], [q.p.x, q.p.y - TRUSS_DEPTH + 0.1, q.p.z], 0.45, 0.4, 8, CONCRETE);
    }
  }

  // Viewing platforms (mapped spurs) and the masts beyond them.
  const mains = pieces.filter((p) => p.id === MAIN);
  const onBorder = (p: P) => p.x < 0.02 || p.z < 0.02 || p.x > CHUNK_SIZE - 0.02 || p.z > CHUNK_SIZE - 0.02;
  const spurs = pieces.filter((p) => SPURS.includes(p.id));
  const arc = (pts: P[]) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; };
  const arcTo = (pts: P[], p: P) => {
    // arc length of the closest point on the polyline
    let best = Infinity, bestS = 0, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x, az = pts[i - 1].z, vx = pts[i].x - ax, vz = pts[i].z - az;
      const l = Math.hypot(vx, vz);
      let t = l > 0 ? ((p.x - ax) * vx + (p.z - az) * vz) / (l * l) : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + vx * t - p.x, az + vz * t - p.z);
      if (d < best) { best = d; bestS = acc + l * t; }
      acc += l;
    }
    return { s: bestS, d: best };
  };
  for (const spur of spurs) {
    const end = spur.raw[spur.raw.length - 1], start = spur.raw[0];
    if (onBorder(end)) continue; // the dead end (and so the mast) belongs to the neighbouring chunk
    const n = spur.pts.length - 1;
    // end rail of the platform
    const L = spur.left[n], R = spur.right[n];
    const ref: V3 = [spur.pts[n - 1].x, end.y + 0.6, spur.pts[n - 1].z];
    for (const [y0, y1] of [[1.12, 1.2], [0.72, 0.76], [0.36, 0.4]]) m.poly([v3(L, y0), v3(R, y0), v3(R, y1), v3(L, y1)], RAIL, ref);
    m.poly([v3(L, -0.3), v3(R, -0.3), v3(R, 0.1), v3(L, 0.1)], STEEL, ref);

    let dx = end.x - start.x, dz = end.z - start.z;
    const dl = Math.hypot(dx, dz);
    if (dl < 0.5) continue;
    dx /= dl; dz /= dl;
    // Mast: pile cap in the river just beyond the platform, mast leaning away from the deck.
    const bx = end.x + dx * 3.2, bz = end.z + dz * 3.2;
    const wet = inWater(bx, bz);
    const footY = wet ? WATER_LEVEL + 2.2 : ctx.height.sample(ox + bx, oz + bz) + 1.2;
    m.lathe(bx, bz, [[2.6, wet ? WATER_LEVEL - 1.5 : footY - 2.5], [2.6, footY - 0.6], [1.5, footY]], 10, CONCRETE, 0, false, true);
    const ce = Math.cos(MAST_ELEVATION), se = Math.sin(MAST_ELEVATION);
    const at = (t: number): V3 => [bx + dx * ce * MAST_LENGTH * t, footY + se * MAST_LENGTH * t, bz + dz * ce * MAST_LENGTH * t];
    const prof: [number, number][] = [[0, 0.55], [0.2, 0.95], [0.45, 1.15], [0.7, 0.95], [0.9, 0.6], [1, 0.38]];
    for (let i = 1; i < prof.length; i++) m.tube(at(prof[i - 1][0]), at(prof[i][0]), prof[i - 1][1], prof[i][1], 8, STEEL);
    // Stylised hornbill head: down-curved beak and a casque on top of it.
    const top = at(1);
    const b1: V3 = [top[0] + dx * 2.6, top[1] + 0.9, top[2] + dz * 2.6], b2: V3 = [top[0] + dx * 5.4, top[1] - 0.6, top[2] + dz * 5.4], b3: V3 = [top[0] + dx * 7.2, top[1] - 2.8, top[2] + dz * 7.2];
    m.tube(top, b1, 0.38, 0.62, 6, STEEL);
    m.tube(b1, b2, 0.62, 0.42, 6, BEAK);
    m.tube(b2, b3, 0.42, 0, 6, BEAK);
    m.tube([top[0] + dx * 1.2, top[1] + 1.2, top[2] + dz * 1.2], [top[0] + dx * 4.4, top[1] + 1.5, top[2] + dz * 4.4], 0.34, 0.2, 5, CASQUE, true);

    // Stay cables: fans from the upper mast to the deck edge on the mast side.
    let host: Piece | null = null, js = 0;
    for (const mp of mains) {
      const r = arcTo(mp.pts, start);
      if (r.d < 0.5) { host = mp; js = r.s; }
    }
    if (!host) continue;
    const total = arc(host.pts);
    // The other platform on the same deck piece marks the main span between the masts.
    let fwdReach = Math.min(58, total - js - 1), backReach = Math.min(58, js - 1);
    for (const other of spurs) {
      if (other === spur) continue;
      const r = arcTo(host.pts, other.raw[0]);
      if (r.d > 0.5) continue;
      const half = Math.abs(r.s - js) * 0.47;
      if (r.s > js) { fwdReach = Math.min(half, total - js - 1); backReach = Math.min(26, js - 1); }
      else { backReach = Math.min(half, js - 1); fwdReach = Math.min(26, total - js - 1); }
    }
    for (const [reach, sign] of [[fwdReach, 1], [backReach, -1]] as [number, number][]) {
      const count = Math.floor((reach - 7) / 6.5) + 1;
      for (let k = 0; k < count; k++) {
        const q = along(host.pts, js + sign * (7 + k * 6.5));
        if (!q) continue;
        // deck edge on the mast side
        const side = -q.tz * dx + q.tx * dz > 0 ? 1 : -1;
        const ax = q.p.x - q.tz * side * (host.hw + 0.12), az = q.p.z + q.tx * side * (host.hw + 0.12);
        const t = 0.6 + (0.37 * (k + 1)) / Math.max(count, 5);
        const mt = at(Math.min(0.975, t));
        m.tube([ax, q.p.y + 0.05, az], mt, 0.07, 0.07, 3, CABLE);
        m.box(ax - 0.15, ax + 0.15, az - 0.15, az + 0.15, q.p.y - 0.3, q.p.y + 0.25, STEEL_DARK);
      }
    }
  }

  return m.mesh(ctx, 'darul-hana');
};

