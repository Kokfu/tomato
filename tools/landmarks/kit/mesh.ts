// Small solid modeller for hand-authored landmark models (runs under Node, no three.js).
// Geometry is written into one vertex-colour buffer per material; tools/landmarks/kit/glb.ts turns
// the result into a quantised binary glTF.
//
// Model frame (metres): origin = centre of the building's street front at ground level,
// +X = to the right for someone facing the building, +Y = up, +Z = out toward the street
// (so the building itself lies at negative z).
//
// Winding: every emitter orients its triangles so that the front face (counter-clockwise) looks
// the way the surface is meant to face. The runtime material is double-sided, where a wrong winding
// would light the face from the wrong side.

export type V3 = [number, number, number];
/** Linear RGB, 0..1. */
export type Col = [number, number, number];
type ColFn = (i: number, j: number) => Col;

const toLinear = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
/** sRGB hex colour -> linear, optionally brightened / darkened. */
export function hex(h: number, mul = 1): Col {
  return [toLinear((h >> 16) & 255) * mul, toLinear((h >> 8) & 255) * mul, toLinear(h & 255) * mul];
}
export function mix(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export const shade = (c: Col, f: number): Col => [c[0] * f, c[1] * f, c[2] * f];

/** Deterministic pseudo-random number in [0, 1) from integers. */
export function rnd(a: number, b = 0, c = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Part {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  get vertices(): number { return this.pos.length / 3; }
  get triangles(): number { return this.idx.length / 3; }
}

interface Xf { a: number; b: number; c: number; d: number; tx: number; ty: number; tz: number; flip: boolean }
export interface Orient { from?: V3; dir?: V3 }

export class MeshBuilder {
  readonly parts = new Map<string, Part>();
  /** Current material name ('opaque', 'glass', 'glow'). */
  material = 'opaque';
  /** 0 = full detail, 1 = distant model (silhouette only). */
  readonly lod: 0 | 1;
  private xf: Xf = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, tz: 0, flip: false };
  private stack: Xf[] = [];

  constructor(lod: 0 | 1) { this.lod = lod; }
  get detail(): boolean { return this.lod === 0; }

  /** Push a local frame: optional mirror in X, then rotation about +Y, then translation. */
  push(o: { x?: number; y?: number; z?: number; rotY?: number; mirrorX?: boolean }): this {
    this.stack.push(this.xf);
    const p = this.xf, r = o.rotY ?? 0, cs = Math.cos(r), sn = Math.sin(r), m = o.mirrorX ? -1 : 1;
    // local: x' = m x cos + z sin ; z' = -m x sin + z cos
    const la = m * cs, lb = sn, lc = -m * sn, ld = cs, lx = o.x ?? 0, lz = o.z ?? 0;
    this.xf = {
      a: p.a * la + p.b * lc, b: p.a * lb + p.b * ld, c: p.c * la + p.d * lc, d: p.c * lb + p.d * ld,
      tx: p.a * lx + p.b * lz + p.tx, ty: p.ty + (o.y ?? 0), tz: p.c * lx + p.d * lz + p.tz, flip: p.flip !== !!o.mirrorX,
    };
    return this;
  }
  pop(): this { this.xf = this.stack.pop()!; return this; }
  /** Run `fn` twice: as is, and mirrored in X. */
  mirrored(fn: (side: 1 | -1) => void): void {
    fn(1);
    this.push({ mirrorX: true }); fn(-1); this.pop();
  }

  private P(p: V3): V3 { const t = this.xf; return [t.a * p[0] + t.b * p[2] + t.tx, p[1] + t.ty, t.c * p[0] + t.d * p[2] + t.tz]; }
  private D(p: V3): V3 { const t = this.xf; return [t.a * p[0] + t.b * p[2], p[1], t.c * p[0] + t.d * p[2]]; }
  private part(): Part {
    let p = this.parts.get(this.material);
    if (!p) this.parts.set(this.material, (p = new Part()));
    return p;
  }

  /** Flat polygon (triangle fan). `face` = direction the polygon must look toward; without it the given order is counter-clockwise seen from the front. */
  flat(pts: V3[], color: Col | Col[], face?: V3): void {
    if (pts.length < 3) return;
    let w = pts.map((p) => this.P(p));
    let cols = Array.isArray(color[0]) ? (color as Col[]) : null;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return;
    nx /= l; ny /= l; nz /= l;
    let rev = false;
    if (face) { const d = this.D(face); rev = nx * d[0] + ny * d[1] + nz * d[2] < 0; }
    else rev = this.xf.flip;
    if (rev) { w = w.slice().reverse(); if (cols) cols = cols.slice().reverse(); if (face) { nx = -nx; ny = -ny; nz = -nz; } }
    if (!face && this.xf.flip) { /* normal of the reversed order */ nx = -nx; ny = -ny; nz = -nz; }
    this.emit(w, cols ?? (color as Col), nx, ny, nz);
  }
  /** World-space polygon whose order already agrees with the normal. */
  private emit(w: V3[], color: Col | Col[], nx: number, ny: number, nz: number): void {
    const cols = Array.isArray(color[0]) ? (color as Col[]) : null;
    const part = this.part(), base = part.vertices;
    for (let i = 0; i < w.length; i++) {
      part.pos.push(w[i][0], w[i][1], w[i][2]);
      part.nrm.push(nx, ny, nz);
      const c = cols ? cols[i] : (color as Col);
      part.col.push(c[0], c[1], c[2]);
    }
    for (let i = 1; i < w.length - 1; i++) part.idx.push(base, base + i, base + i + 1);
  }

  /**
   * Smooth-shaded grid of points: rows[j][i]. Orientation: away from `from`, or along `dir`; one of
   * them is required unless the rows are already counter-clockwise.
   */
  grid(rows: V3[][], color: Col | ColFn, orient: Orient = {}, smooth = true): void {
    const nv = rows.length - 1, nu = rows[0].length - 1;
    if (nv < 1 || nu < 1) return;
    const w = rows.map((r) => r.map((p) => this.P(p)));
    const cell = (i: number, j: number): V3 => {
      const a = w[j][i], b = w[j][i + 1], c = w[j + 1][i + 1], d = w[j + 1][i];
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    // Decide the winding from the cells' summed normal against the wanted direction.
    let rev = this.xf.flip;
    if (orient.from || orient.dir) {
      let s = 0;
      const f = orient.from ? this.P(orient.from) : null, d = orient.dir ? this.D(orient.dir) : null;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const n = cell(i, j);
        if (d) s += n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
        else {
          const a = w[j][i], c = w[j + 1][i + 1];
          s += n[0] * ((a[0] + c[0]) / 2 - f![0]) + n[1] * ((a[1] + c[1]) / 2 - f![1]) + n[2] * ((a[2] + c[2]) / 2 - f![2]);
        }
      }
      rev = s < 0;
    }
    const part = this.part();
    const colAt = (i: number, j: number): Col => (typeof color === 'function' ? color(i, j) : color);
    if (!smooth) {
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        let q = [w[j][i], w[j][i + 1], w[j + 1][i + 1], w[j + 1][i]];
        const cs = colAt(i, j); // faceted: one colour per cell
        const n = cell(i, j);
        const l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-12) continue;
        const s = (rev ? -1 : 1) / l;
        if (rev) q = q.reverse();
        this.emit(q, cs, n[0] * s, n[1] * s, n[2] * s);
      }
      return;
    }
    const base = part.vertices, W = nu + 1;
    const acc = new Float64Array((nu + 1) * (nv + 1) * 3);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = w[j][i], c = colAt(i, j);
      part.pos.push(p[0], p[1], p[2]);
      part.col.push(c[0], c[1], c[2]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const n = cell(i, j);
      const s = rev ? -1 : 1;
      for (const k of [j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i]) { acc[k * 3] += n[0] * s; acc[k * 3 + 1] += n[1] * s; acc[k * 3 + 2] += n[2] * s; }
      const a = base + j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      if (rev) part.idx.push(a, c, b, a, d, c); else part.idx.push(a, b, c, a, c, d);
    }
    for (let k = 0; k < acc.length; k += 3) {
      const l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1;
      part.nrm.push(acc[k] / l, acc[k + 1] / l, acc[k + 2] / l);
    }
  }

  /** Axis-aligned box. `skip` lists faces to leave out: any of 'x-', 'x+', 'y-', 'y+', 'z-', 'z+'. The bottom is skipped by default. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: Col, skip: string[] = ['y-'], top?: Col): void {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const s = new Set(skip);
    if (!s.has('x-')) this.flat([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], color, [-1, 0, 0]);
    if (!s.has('x+')) this.flat([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], color, [1, 0, 0]);
    if (!s.has('z-')) this.flat([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], color, [0, 0, -1]);
    if (!s.has('z+')) this.flat([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color, [0, 0, 1]);
    if (!s.has('y+')) this.flat([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], top ?? color, [0, 1, 0]);
    if (!s.has('y-')) this.flat([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], color, [0, -1, 0]);
  }

  /** Surface of revolution about the vertical axis through (x, z). profile = [radius, y] pairs, bottom to top. */
  lathe(x: number, z: number, profile: [number, number][], seg: number, color: Col | ColFn): void {
    const rows = profile.map(([r, y]) => {
      const row: V3[] = [];
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; row.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]); }
      return row;
    });
    const ym = (profile[0][1] + profile[profile.length - 1][1]) / 2;
    this.grid(rows, color, { from: [x, ym, z] });
  }
  cyl(x: number, z: number, y0: number, y1: number, r: number, seg: number, color: Col, cap = true): void {
    this.lathe(x, z, [[r, y0], [r, y1]], seg, color);
    if (cap) { const top: V3[] = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; top.push([x + Math.cos(a) * r, y1, z + Math.sin(a) * r]); } this.flat(top, color, [0, 1, 0]); }
  }
  sphere(x: number, y: number, z: number, r: number, seg: number, rings: number, color: Col | ColFn, sy = 1): void {
    const prof: [number, number][] = [];
    for (let j = 0; j <= rings; j++) { const a = -Math.PI / 2 + (j / rings) * Math.PI; prof.push([Math.max(1e-4, Math.cos(a) * r), y + Math.sin(a) * r * sy]); }
    this.lathe(x, z, prof, seg, color);
  }

  /**
   * Sweep a closed cross-section along a path. section(i) returns [across, up] offsets for path
   * point i; "across" is horizontal, perpendicular to the path. Smooth along the path, faceted
   * across the section; ends are capped.
   */
  sweep(path: V3[], section: (i: number) => [number, number][], color: Col | ((edge: number, i: number) => Col), caps = true, closed = true, smooth = true): void {
    const n = path.length;
    if (n < 2) return;
    const rings: V3[][] = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      const rx = -tz, rz = tx; // horizontal normal of the path
      rings.push(section(i).map(([s, u]) => [path[i][0] + rx * s, path[i][1] + u, path[i][2] + rz * s] as V3));
    }
    const m = rings[0].length;
    const centre = (i: number): V3 => { const c: V3 = [0, 0, 0]; for (const p of rings[i]) { c[0] += p[0] / m; c[1] += p[1] / m; c[2] += p[2] / m; } return c; };
    for (let k = 0; k < (closed ? m : m - 1); k++) {
      const k2 = (k + 1) % m;
      const rows = [rings.map((r) => r[k]), rings.map((r) => r[k2])];
      const mid = Math.floor((n - 1) / 2);
      this.grid(rows, typeof color === 'function' ? (i) => color(k, i) : color, { from: centre(mid) }, smooth);
    }
    if (caps && closed) {
      const c0 = typeof color === 'function' ? color(0, 0) : color, c1 = typeof color === 'function' ? color(0, n - 1) : color;
      const d0: V3 = [path[0][0] - path[1][0], path[0][1] - path[1][1], path[0][2] - path[1][2]];
      const d1: V3 = [path[n - 1][0] - path[n - 2][0], path[n - 1][1] - path[n - 2][1], path[n - 1][2] - path[n - 2][2]];
      this.flat(rings[0], c0, d0);
      this.flat(rings[n - 1], c1, d1);
    }
  }
  /** Round tube along a path (free 3D curve). */
  tube(path: V3[], radius: number | ((i: number) => number), seg: number, color: Col | ColFn): void {
    const n = path.length;
    const rows: V3[][] = [];
    for (let k = 0; k <= seg; k++) rows.push([]);
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      const t: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const tl = Math.hypot(t[0], t[1], t[2]) || 1;
      t[0] /= tl; t[1] /= tl; t[2] /= tl;
      // frame: side = t x up (or x axis when t is vertical), then up' = side x t
      let s: V3 = [t[2], 0, -t[0]];
      let sl = Math.hypot(s[0], s[2]);
      if (sl < 1e-4) { s = [1, 0, 0]; sl = 1; }
      s = [s[0] / sl, 0, s[2] / sl];
      const u: V3 = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
      const r = typeof radius === 'function' ? radius(i) : radius;
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2, cs = Math.cos(ang) * r, sn = Math.sin(ang) * r;
        rows[k].push([path[i][0] + s[0] * cs + u[0] * sn, path[i][1] + s[1] * cs + u[1] * sn, path[i][2] + s[2] * cs + u[2] * sn]);
      }
    }
    const mid = path[Math.floor(n / 2)];
    this.grid(rows, color, { from: mid });
  }

  get triangles(): number { let t = 0; for (const p of this.parts.values()) t += p.triangles; return t; }
  get vertices(): number { let t = 0; for (const p of this.parts.values()) t += p.vertices; return t; }
  bounds(): { min: V3; max: V3 } {
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const p of this.parts.values()) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]); }
    return { min, max };
  }
}

/** Quadratic Bezier sample. */
export function bez(a: V3, b: V3, c: V3, t: number): V3 {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]];
}
