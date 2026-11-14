// Shared helpers for the procedural landmark models: footprint fitting and a small flat-shaded
// solid modeller that writes into one merged vertex-colour buffer (one draw call per landmark).
import * as THREE from 'three';
import { CHUNK_SIZE, QUANT, BANK_LEVEL } from '../config.ts';
import type { ChunkData, BuildingData } from '../types.ts';
import { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';

export type V3 = [number, number, number];

export function col(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

/** A mapped building footprint in chunk-local metres with its fitted oriented bounding box. */
export interface Footprint {
  /** Outer ring, flat [x0, z0, x1, z1, ...]. */
  ring: number[];
  holes: number[][];
  /** OBB centre. */
  cx: number;
  cz: number;
  /** Unit vector of the long axis ("a") and the perpendicular short axis ("b"). */
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  /** Full extent along the long / short axis (metres). */
  L: number;
  W: number;
  /** Lowest and mean terrain elevation under the outline. */
  gMin: number;
  gMean: number;
  /** Height from the chunk data (metres) and its provenance (0 tag, 1 levels, 2 estimated). */
  h: number;
  hs: number;
}

export function findBuilding(data: ChunkData, ids: number[]): BuildingData | undefined {
  return data.buildings.find((b) => ids.includes(b.id));
}

/** Minimum-area oriented bounding box of the mapped ring (tested over all edge directions). */
export function fitFootprint(b: BuildingData, data: ChunkData, ctx: BuildContext): Footprint {
  const ring = b.r[0].map((v) => v / QUANT);
  const holes = b.r.slice(1).map((r) => r.map((v) => v / QUANT));
  const n = ring.length / 2;
  let best = { area: Infinity, ux: 1, uz: 0, a0: 0, a1: 0, b0: 0, b1: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = ring[j * 2] - ring[i * 2], uz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.05) continue;
    ux /= l; uz /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = ring[k * 2] * ux + ring[k * 2 + 1] * uz, bb = -ring[k * 2] * uz + ring[k * 2 + 1] * ux;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (area < best.area - 1e-6) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  let { ux, uz, a0, a1, b0, b1 } = best;
  if (b1 - b0 > a1 - a0) {
    // make "a" the long axis: rotate the frame by 90 degrees
    [ux, uz] = [-uz, ux];
    [a0, a1, b0, b1] = [b0, b1, -a1, -a0];
  }
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  const vx = -uz, vz = ux;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let gMin = Infinity, gSum = 0;
  for (let k = 0; k < n; k++) {
    const g = ctx.height.sample(ox + ring[k * 2], oz + ring[k * 2 + 1]);
    gMin = Math.min(gMin, g);
    gSum += g;
  }
  return { ring, holes, cx: ca * ux + cb * vx, cz: ca * uz + cb * vz, ux, uz, vx, vz, L: a1 - a0, W: b1 - b0, gMin, gMean: gSum / n, h: b.h / QUANT, hs: b.hs };
}

/** Ring converted to the footprint frame: flat [a0, b0, a1, b1, ...]. */
export function ringLocal(fp: Footprint, ring = fp.ring): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const dx = ring[i] - fp.cx, dz = ring[i + 1] - fp.cz;
    out.push(dx * fp.ux + dz * fp.uz, dx * fp.vx + dz * fp.vz);
  }
  return out;
}

export function pointInRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
  }
  return inside;
}

export function distToRing(x: number, z: number, r: number[]): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const ax = r[j], az = r[j + 1], vx = r[i] - ax, vz = r[i + 1] - az;
    const l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
}

/** Extent [min, max] of a ring (footprint frame) along b at a given a, or null when outside. */
export function sliceExtent(loc: number[], a: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = loc.length - 2; i < loc.length; j = i, i += 2) {
    const a0 = loc[j], a1 = loc[i];
    if (a0 > a === a1 > a) continue;
    const b = loc[j + 1] + ((a - a0) / (a1 - a0)) * (loc[i + 1] - loc[j + 1]);
    lo = Math.min(lo, b); hi = Math.max(hi, b);
  }
  return lo < hi ? [lo, hi] : null;
}

export interface Rect { a0: number; a1: number; b0: number; b1: number }

/**
 * Decompose a (roughly rectilinear) footprint into rectangles in its own frame by slicing it
 * along the long axis and merging slices of similar cross extent.
 */
export function sliceRects(fp: Footprint, step = 1, tol = 1.5): Rect[] {
  const loc = ringLocal(fp);
  const rects: Rect[] = [];
  let cur: (Rect & { n: number; s0: number; s1: number }) | null = null;
  const n = Math.max(2, Math.round(fp.L / step));
  for (let i = 0; i < n; i++) {
    const a = -fp.L / 2 + ((i + 0.5) / n) * fp.L;
    const e = sliceExtent(loc, a);
    const lo = -fp.L / 2 + (i / n) * fp.L, hi = lo + fp.L / n;
    if (e && cur && Math.abs(e[0] - cur.s0 / cur.n) < tol && Math.abs(e[1] - cur.s1 / cur.n) < tol) {
      cur.a1 = hi; cur.n++; cur.s0 += e[0]; cur.s1 += e[1];
      cur.b0 = cur.s0 / cur.n; cur.b1 = cur.s1 / cur.n;
      continue;
    }
    if (cur) rects.push(cur);
    cur = e ? { a0: lo, a1: hi, b0: e[0], b1: e[1], n: 1, s0: e[0], s1: e[1] } : null;
  }
  if (cur) rects.push(cur);
  return rects.filter((r) => r.a1 - r.a0 > 1.2 && r.b1 - r.b0 > 1.2);
}

/** Polygon ring offset inward (d > 0) with mitred corners. Ring orientation is detected. */
export function insetRing(r: number[], d: number): number[] {
  const n = r.length / 2;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) area += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  const s = area > 0 ? 1 : -1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let d1x = r[i * 2] - r[p * 2], d1z = r[i * 2 + 1] - r[p * 2 + 1];
    let d2x = r[q * 2] - r[i * 2], d2z = r[q * 2 + 1] - r[i * 2 + 1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    // inward normals (left of travel for positive area in x/z)
    const n1x = -d1z * s, n1z = d1x * s, n2x = -d2z * s, n2z = d2x * s;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
    const cos = Math.max(0.35, mx * n1x + mz * n1z);
    out.push(r[i * 2] + (mx * d) / cos, r[i * 2 + 1] + (mz * d) / cos);
  }
  return out;
}

/**
 * Flat-shaded solid modeller. Solids are described in a local frame: origin (ox, oz), "a" along
 * the unit vector (ux, uz), "b" perpendicular, y absolute. Points are V3 = [a, y, b].
 */
export class Model {
  readonly buf = new GeoBuf();
  ox = 0;
  oz = 0;
  ux = 1;
  uz = 0;

  /** Use a footprint's OBB frame. */
  frame(fp: { cx: number; cz: number; ux: number; uz: number }): this {
    this.ox = fp.cx; this.oz = fp.cz; this.ux = fp.ux; this.uz = fp.uz;
    return this;
  }

  /** Chunk-local frame (a = x, b = z). */
  world(): this {
    this.ox = 0; this.oz = 0; this.ux = 1; this.uz = 0;
    return this;
  }

  get triangles(): number {
    return this.buf.idx.length / 3;
  }

  private X(p: V3): number { return this.ox + p[0] * this.ux - p[2] * this.uz; }
  private Z(p: V3): number { return this.oz + p[0] * this.uz + p[2] * this.ux; }

  /**
   * Planar convex polygon. The face is oriented away from `ref` (a point inside the solid, local
   * frame); without `ref` it faces up. Winding and normal always agree (double-sided lighting).
   */
  poly(pts: V3[], c: THREE.Color, ref?: V3): void {
    const n = pts.length;
    if (n < 3) return;
    const w: number[] = [];
    for (const p of pts) w.push(this.X(p), p[1], this.Z(p));
    // Newell normal
    let nx = 0, ny = 0, nz = 0, mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = w[i * 3], ay = w[i * 3 + 1], az = w[i * 3 + 2], bx = w[j * 3], by = w[j * 3 + 1], bz = w[j * 3 + 2];
      nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by);
      mx += ax; my += ay; mz += az;
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    let flip: boolean;
    if (ref) {
      const rx = this.X(ref), rz = this.Z(ref);
      flip = nx * (mx / n - rx) + ny * (my / n - ref[1]) + nz * (mz / n - rz) < 0;
    } else flip = ny < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const base = this.buf.count;
    for (let i = 0; i < n; i++) this.buf.vert(w[i * 3], w[i * 3 + 1], w[i * 3 + 2], nx, ny, nz, c);
    for (let i = 1; i < n - 1; i++) {
      if (flip) this.buf.tri(base, base + i + 1, base + i);
      else this.buf.tri(base, base + i, base + i + 1);
    }
  }

  /** Axis-aligned box in the local frame. */
  box(a0: number, a1: number, b0: number, b1: number, y0: number, y1: number, c: THREE.Color, top: THREE.Color | null = c, bottom = false): void {
    const ref: V3 = [(a0 + a1) / 2, (y0 + y1) / 2, (b0 + b1) / 2];
    this.poly([[a0, y0, b0], [a1, y0, b0], [a1, y1, b0], [a0, y1, b0]], c, ref);
    this.poly([[a0, y0, b1], [a1, y0, b1], [a1, y1, b1], [a0, y1, b1]], c, ref);
    this.poly([[a0, y0, b0], [a0, y0, b1], [a0, y1, b1], [a0, y1, b0]], c, ref);
    this.poly([[a1, y0, b0], [a1, y0, b1], [a1, y1, b1], [a1, y1, b0]], c, ref);
    if (top) this.poly([[a0, y1, b0], [a1, y1, b0], [a1, y1, b1], [a0, y1, b1]], top, ref);
    if (bottom) this.poly([[a0, y0, b0], [a1, y0, b0], [a1, y0, b1], [a0, y0, b1]], c, ref);
  }

  /**
   * Surface of revolution around the vertical through (ca, cb). `profile` is a list of [radius, y]
   * from bottom to top; a radius of 0 closes to a point. `n` sides.
   */
  lathe(ca: number, cb: number, profile: [number, number][], n: number, c: THREE.Color | ((ring: number) => THREE.Color), phase = 0, capBottom = false, capTop = false): void {
    const ring = (r: number, y: number): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i < n; i++) {
        const t = phase + (i / n) * Math.PI * 2;
        out.push([ca + Math.cos(t) * r, y, cb + Math.sin(t) * r]);
      }
      return out;
    };
    const yMid = (profile[0][1] + profile[profile.length - 1][1]) / 2;
    const ref: V3 = [ca, yMid, cb];
    let prev = ring(profile[0][0], profile[0][1]);
    if (capBottom) this.poly(prev, typeof c === 'function' ? c(0) : c, [ca, profile[0][1] + 1, cb]);
    for (let k = 1; k < profile.length; k++) {
      const cur = ring(profile[k][0], profile[k][1]);
      const cc = typeof c === 'function' ? c(k - 1) : c;
      const r2: V3 = [ca, (profile[k - 1][1] + profile[k][1]) / 2, cb];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (profile[k][0] < 1e-6) this.poly([prev[i], prev[j], cur[i]], cc, r2);
        else if (profile[k - 1][0] < 1e-6) this.poly([prev[i], cur[j], cur[i]], cc, r2);
        else this.poly([prev[i], prev[j], cur[j], cur[i]], cc, r2);
      }
      prev = cur;
    }
    if (capTop) this.poly(prev, typeof c === 'function' ? c(profile.length - 1) : c, ref);
  }

  /** Tapered tube between two arbitrary points given in the local frame. */
  tube(p0: V3, p1: V3, r0: number, r1: number, n: number, c: THREE.Color, caps = false): void {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    if (d.lengthSq() < 1e-9) return;
    d.normalize();
    const s = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const t = new THREE.Vector3().crossVectors(d, s);
    const A: V3[] = [], B: V3[] = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      const ox = s.x * cs + t.x * sn, oy = s.y * cs + t.y * sn, oz = s.z * cs + t.z * sn;
      A.push([p0[0] + ox * r0, p0[1] + oy * r0, p0[2] + oz * r0]);
      B.push([p1[0] + ox * r1, p1[1] + oy * r1, p1[2] + oz * r1]);
    }
    const ref: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (r1 < 1e-6) this.poly([A[i], A[j], B[i]], c, ref);
      else this.poly([A[i], A[j], B[j], B[i]], c, ref);
    }
    if (caps) { this.poly(A, c, ref); if (r1 > 1e-6) this.poly(B, c, ref); }
  }

  /** Vertical walls along a closed ring (flat [a, b, ...] in the local frame), facing away from the ring interior. */
  walls(ring: number[], y0: number, y1: number, c: THREE.Color, inward = false): void {
    const n = ring.length / 2;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i, i++) area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    const s = (area > 0 ? 1 : -1) * (inward ? -1 : 1);
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ax = ring[j * 2], az = ring[j * 2 + 1], bx = ring[i * 2], bz = ring[i * 2 + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.01) continue;
      // a point on the inner side of this edge
      const ref: V3 = [(ax + bx) / 2 - ((bz - az) / l) * s, (y0 + y1) / 2, (az + bz) / 2 + ((bx - ax) / l) * s];
      this.poly([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], c, ref);
    }
  }

  /** Flat cap over a polygon with optional holes (local frame), facing up (or down). */
  cap(ring: number[], holes: number[][], y: number, c: THREE.Color, down = false): void {
    const toV = (r: number[]) => { const o: THREE.Vector2[] = []; for (let i = 0; i < r.length; i += 2) o.push(new THREE.Vector2(r[i], r[i + 1])); return o; };
    let tris: number[][];
    try { tris = THREE.ShapeUtils.triangulateShape(toV(ring), holes.map(toV)); } catch { return; }
    const all = [ring, ...holes].flat();
    const ref: V3 = [0, down ? y + 1 : y - 1, 0];
    for (const t of tris) {
      const p = t.map((i) => [all[i * 2], y, all[i * 2 + 1]] as V3);
      ref[0] = p[0][0]; ref[2] = p[0][2];
      this.poly(p, c, ref);
    }
  }

  /** Battlements: merlons along a closed ring (local frame) standing on y. */
  crenels(ring: number[], y: number, h: number, c: THREE.Color, pitch = 1.6, depth = 0.45): void {
    const n = ring.length / 2;
    const save = { ox: this.ox, oz: this.oz, ux: this.ux, uz: this.uz };
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i, i++) area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    const s = area > 0 ? 1 : -1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ax = ring[j * 2], az = ring[j * 2 + 1], bx = ring[i * 2], bz = ring[i * 2 + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < pitch * 0.8) continue;
      const dx = (bx - ax) / l, dz = (bz - az) / l;
      // temporary frame along this edge: a = along edge, b = inward
      const wx = save.ox + ax * save.ux - az * save.uz, wz = save.oz + ax * save.uz + az * save.ux;
      this.ox = wx; this.oz = wz;
      this.ux = dx * save.ux - dz * save.uz; this.uz = dx * save.uz + dz * save.ux;
      const count = Math.max(1, Math.round(l / pitch));
      const step = l / count;
      for (let k = 0; k < count; k++) {
        const a0 = k * step + step * 0.22, a1 = (k + 1) * step - step * 0.22;
        if (s > 0) this.box(a0, a1, 0, depth, y, y + h, c);
        else this.box(a0, a1, -depth, 0, y, y + h, c);
      }
      this.ox = save.ox; this.oz = save.oz; this.ux = save.ux; this.uz = save.uz;
    }
  }

  /**
   * Pitched roof over a rectangle. Ridge runs along a (or along b when `alongB`); `hip` in metres
   * pulls the ridge ends in (0 = gable ends, filled with `gable` colour).
   */
  roof(r: Rect, y: number, rise: number, c: THREE.Color, opts: { hip?: number; alongB?: boolean; gable?: THREE.Color; over?: number } = {}): void {
    const ov = opts.over ?? 0;
    const a0 = r.a0 - ov, a1 = r.a1 + ov, b0 = r.b0 - ov, b1 = r.b1 + ov;
    const hip = opts.hip ?? 0;
    const ref: V3 = [(a0 + a1) / 2, y - 1, (b0 + b1) / 2];
    if (!opts.alongB) {
      const bm = (b0 + b1) / 2, h = Math.min(hip, (a1 - a0) / 2 - 0.01);
      const R0: V3 = [a0 + h, y + rise, bm], R1: V3 = [a1 - h, y + rise, bm];
      this.poly([[a0, y, b0], [a1, y, b0], R1, R0], c, ref);
      this.poly([[a0, y, b1], [a1, y, b1], R1, R0], c, ref);
      this.poly([[a0, y, b0], [a0, y, b1], R0], h > 0 ? c : opts.gable ?? c, ref);
      this.poly([[a1, y, b0], [a1, y, b1], R1], h > 0 ? c : opts.gable ?? c, ref);
    } else {
      const am = (a0 + a1) / 2, h = Math.min(hip, (b1 - b0) / 2 - 0.01);
      const R0: V3 = [am, y + rise, b0 + h], R1: V3 = [am, y + rise, b1 - h];
      this.poly([[a0, y, b0], [a0, y, b1], R1, R0], c, ref);
      this.poly([[a1, y, b0], [a1, y, b1], R1, R0], c, ref);
      this.poly([[a0, y, b0], [a1, y, b0], R0], h > 0 ? c : opts.gable ?? c, ref);
      this.poly([[a0, y, b1], [a1, y, b1], R1], h > 0 ? c : opts.gable ?? c, ref);
    }
    if (ov > 0) this.poly([[a0, y, b0], [a1, y, b0], [a1, y, b1], [a0, y, b1]], c, [ref[0], y + 1, ref[2]]);
  }

  /** Finish: one mesh using the shared landmark material. */
  mesh(ctx: BuildContext, name: string): THREE.Mesh | null {
    const g = this.buf.build();
    if (!g) return null;
    const m = new THREE.Mesh(g, ctx.mats.landmark);
    m.name = name;
    m.castShadow = ctx.detail === 'high';
    m.receiveShadow = true;
    m.userData.landmark = name;
    m.userData.triangles = this.triangles;
    return m;
  }
}

/**
 * Which of the four footprint-frame directions (+a, -a, +b, -b) reaches the river first. Used to
 * orient river-facing facades from data. The global height grid is flattened to exactly BANK_LEVEL
 * on and next to mapped water, so a run of bank-level samples marks the river corridor (this works
 * for water in chunks that are not loaded, unlike CollisionWorld.inWater).
 * `endWeight` > 1 makes the long sides (+b / -b) win unless an end is clearly closer.
 * Returns [da, db], or null if no river is within `maxDist`.
 */
export function towardWater(fp: Footprint, data: ChunkData, ctx: BuildContext, maxDist = 400, endWeight = 1): [number, number] | null {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let best: [number, number] | null = null, bestD = Infinity;
  for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    const dx = da * fp.ux + db * fp.vx, dz = da * fp.uz + db * fp.vz;
    const start = (da ? fp.L : fp.W) / 2 + 4;
    let run = 0;
    for (let d = start; d < start + maxDist + 24; d += 4) {
      if (ctx.height.sample(ox + fp.cx + dx * d, oz + fp.cz + dz * d) <= BANK_LEVEL + 0.02) run++;
      else run = 0;
      if (run >= 6) {
        const w = (d - 20 - start) * (da ? endWeight : 1);
        if (w < bestD) { bestD = w; best = [da, db]; }
        break;
      }
    }
  }
  return best;
}

/** Point-in-water test against the chunk's own mapped water polygons (deterministic per chunk). */
export function chunkWaterTest(data: ChunkData): (x: number, z: number) => boolean {
  const polys = data.water.map((p) => p.map((r) => r.map((v) => v / QUANT)));
  return (x, z) => {
    for (const p of polys) {
      if (!pointInRing(x, z, p[0])) continue;
      let hole = false;
      for (let i = 1; i < p.length; i++) if (pointInRing(x, z, p[i])) hole = true;
      if (!hole) return true;
    }
    return false;
  };
}

/** Area centroid of a ring (flat [x, z, ...]). */
export function centroid(r: number[]): [number, number] {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const w = r[j] * r[i + 1] - r[i] * r[j + 1];
    a += w; cx += (r[j] + r[i]) * w; cz += (r[j + 1] + r[i + 1]) * w;
  }
  if (Math.abs(a) < 1e-9) return [r[0], r[1]];
  return [cx / (3 * a), cz / (3 * a)];
}

/** Ring scaled about a point. */
export function scaleRing(r: number[], cx: number, cz: number, s: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.length; i += 2) out.push(cx + (r[i] - cx) * s, cz + (r[i + 1] - cz) * s);
  return out;
}

/**
 * Row of recessed-looking dark openings (windows, arches) on a wall from (a0, b0) to (a1, b1) in
 * the model's local frame. `inside` is any point on the inner side of the wall.
 */
export function windowRow(m: Model, a0: number, b0: number, a1: number, b1: number, y0: number, y1: number, pitch: number, width: number, c: THREE.Color, inside: [number, number]): void {
  const l = Math.hypot(a1 - a0, b1 - b0);
  if (l < width + 0.6) return;
  const da = (a1 - a0) / l, db = (b1 - b0) / l;
  let na = -db, nb = da;
  if (na * (inside[0] - a0) + nb * (inside[1] - b0) > 0) { na = -na; nb = -nb; }
  const count = Math.max(1, Math.floor(l / pitch));
  const step = l / count;
  for (let k = 0; k < count; k++) {
    const s0 = (k + 0.5) * step - width / 2, s1 = s0 + width;
    const pa0 = a0 + da * s0 + na * 0.06, pb0 = b0 + db * s0 + nb * 0.06, pa1 = a0 + da * s1 + na * 0.06, pb1 = b0 + db * s1 + nb * 0.06;
    m.poly([[pa0, y0, pb0], [pa1, y0, pb1], [pa1, y1, pb1], [pa0, y1, pb0]], c, [inside[0], (y0 + y1) / 2, inside[1]]);
  }
}

/** Window rows along every edge of a ring. */
export function windowRing(m: Model, ring: number[], y0: number, y1: number, pitch: number, width: number, c: THREE.Color, inwardFacing = false): void {
  const n = ring.length / 2;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  const s = (area > 0 ? 1 : -1) * (inwardFacing ? -1 : 1);
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ax = ring[j * 2], az = ring[j * 2 + 1], bx = ring[i * 2], bz = ring[i * 2 + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 0.01) continue;
    windowRow(m, ax, az, bx, bz, y0, y1, pitch, width, c, [(ax + bx) / 2 - ((bz - az) / l) * s, (az + bz) / 2 + ((bx - ax) / l) * s]);
  }
}

/** Onion / bulb dome profile for Model.lathe, radius r, base at y. */
export function onionProfile(r: number, y: number, bulge = 1.12, height = 1.5): [number, number][] {
  const out: [number, number][] = [];
  const pts: [number, number][] = [[0.92, 0], [bulge, 0.22], [bulge * 0.98, 0.4], [0.85, 0.6], [0.55, 0.78], [0.22, 0.92], [0.06, 1.04], [0, 1.22]];
  for (const [pr, py] of pts) out.push([pr * r, y + py * r * height]);
  return out;
}
