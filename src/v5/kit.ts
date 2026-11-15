// V5 geometry kit: builds merged, multi-material triangle meshes with real architectural depth.
// Pure TypeScript with no three.js import, so the same code runs in the browser (procedural
// generation at load) and under Node (offline export of landmark models to GLB).
//
// Conventions: metres, +Y up. Vertex colours are linear RGB and carry both the paint colour and
// baked occlusion (darker in recesses, under eaves, at wall feet). Surface detail (grain, tile
// courses, slats, joints) is NOT geometry and NOT in the colours: the material shaders add it.

export type V3 = [number, number, number];
export type Col = [number, number, number];

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** sRGB hex to linear colour, optionally scaled. */
export const hex = (h: number, s = 1): Col => [s2l(((h >> 16) & 255) / 255) * s, s2l(((h >> 8) & 255) / 255) * s, s2l((h & 255) / 255) * s];
export const shade = (c: Col, s: number): Col => [c[0] * s, c[1] * s, c[2] * s];
export const mix = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Deterministic hash to 0..1. */
export function rnd(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((b | 0) + 0x85ebca6b, 2246822519) ^ Math.imul((c | 0) + 0x27d4eb2f, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Buf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  get count(): number { return this.pos.length / 3; }
}

export interface Opening {
  x0: number; x1: number; y0: number; y1: number;
  /** Rise of an arched head (0 = flat lintel). The arch springs at y1 - arch. */
  arch?: number;
}

interface Tf { m: number[]; flip: boolean }
const IDENT: Tf = { m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], flip: false };

function mul(a: number[], b: number[]): number[] {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}

export interface Place { x?: number; y?: number; z?: number; ry?: number; rx?: number; rz?: number; s?: number; mirrorX?: boolean }

export class Kit {
  readonly bufs = new Map<string, Buf>();
  /** Current material slot. */
  mat = 'plaster';
  /** Level of detail: 0 = full, 1 = simplified (small ornament skipped by the generators). */
  lod: 0 | 1;
  private stack: Tf[] = [IDENT];
  private b!: Buf;

  constructor(lod: 0 | 1 = 0) { this.lod = lod; this.use('plaster'); }
  get detail(): boolean { return this.lod === 0; }

  use(name: string): this {
    this.mat = name;
    let b = this.bufs.get(name);
    if (!b) { b = new Buf(); this.bufs.set(name, b); }
    this.b = b;
    return this;
  }

  push(p: Place): void {
    const t = this.stack[this.stack.length - 1];
    let m = [1, 0, 0, p.x ?? 0, 0, 1, 0, p.y ?? 0, 0, 0, 1, p.z ?? 0];
    if (p.ry) { const c = Math.cos(p.ry), s = Math.sin(p.ry); m = mul(m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); }
    if (p.rx) { const c = Math.cos(p.rx), s = Math.sin(p.rx); m = mul(m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); }
    if (p.rz) { const c = Math.cos(p.rz), s = Math.sin(p.rz); m = mul(m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); }
    if (p.s !== undefined) m = mul(m, [p.s, 0, 0, 0, 0, p.s, 0, 0, 0, 0, p.s, 0]);
    if (p.mirrorX) m = mul(m, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    this.stack.push({ m: mul(t.m, m), flip: t.flip !== !!p.mirrorX });
  }
  pop(): void { this.stack.pop(); }
  at(p: Place, fn: () => void): void { this.push(p); fn(); this.pop(); }
  /** Run fn twice: as is and mirrored in x. */
  mirrored(fn: (side: 1 | -1) => void): void { fn(1); this.push({ mirrorX: true }); fn(-1); this.pop(); }

  private tp(p: V3): V3 {
    const m = this.stack[this.stack.length - 1].m;
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
  }
  private tn(n: V3): V3 {
    const t = this.stack[this.stack.length - 1], m = t.m;
    // rotation + uniform scale + mirror only, so the matrix itself transforms normals (after normalising)
    const x = m[0] * n[0] + m[1] * n[1] + m[2] * n[2], y = m[4] * n[0] + m[5] * n[1] + m[6] * n[2], z = m[8] * n[0] + m[9] * n[1] + m[10] * n[2];
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  /** Raw vertex in local coordinates. Returns its index in the current buffer. */
  v(p: V3, n: V3, c: Col, u = 0, w = 0): number {
    const P = this.tp(p), N = this.tn(n), b = this.b;
    b.pos.push(P[0], P[1], P[2]);
    b.nor.push(N[0], N[1], N[2]);
    b.col.push(c[0], c[1], c[2]);
    b.uv.push(u, w);
    return b.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    if (this.stack[this.stack.length - 1].flip) this.b.idx.push(a, c, b);
    else this.b.idx.push(a, b, c);
  }

  /** Flat convex polygon, counter-clockwise seen from its front. cols: one colour or one per vertex. */
  poly(pts: V3[], col: Col | Col[], uvs?: [number, number][]): void {
    const a = pts[0], b = pts[1], c = pts[pts.length - 1];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= l; n[1] /= l; n[2] /= l;
    const per = Array.isArray(col[0]);
    const i0 = this.b.count;
    pts.forEach((p, i) => this.v(p, n, per ? (col as Col[])[i] : (col as Col), uvs?.[i][0] ?? 0, uvs?.[i][1] ?? 0));
    for (let i = 1; i < pts.length - 1; i++) this.tri(i0, i0 + i, i0 + i + 1);
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: Col | Col[], uv?: [number, number, number, number]): void {
    this.poly([a, b, c, d], col, uv ? [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] : undefined);
  }

  /**
   * Axis-aligned box. `skip` lists faces to omit, e.g. 'y-z-'. `foot` darkens the lower edge of the
   * vertical faces (baked contact shadow where the box meets the ground or a ledge).
   */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: Col, skip = '', foot = 1): void {
    const lo = foot === 1 ? col : shade(col, foot);
    const side: Col[] = [lo, lo, col, col];
    if (!skip.includes('z+')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side);
    if (!skip.includes('z-')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side);
    if (!skip.includes('x+')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side);
    if (!skip.includes('x-')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side);
    if (!skip.includes('y+')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
    if (!skip.includes('y-')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], shade(col, 0.7));
  }

  /**
   * Prism along local x from xa to xb. The section is a closed polygon of [z, y] points listed
   * counter-clockwise in the (z, y) plane with z to the right and y up. Used for cornices, sills, beams,
   * gutters, kerbs. Sides are flat shaded; `caps` closes the ends.
   */
  prism(sec: [number, number][], xa: number, xb: number, col: Col | ((edge: number) => Col), caps = true): void {
    const n = sec.length;
    for (let i = 0; i < n; i++) {
      const p = sec[i], q = sec[(i + 1) % n];
      const c = typeof col === 'function' ? col(i) : col;
      this.quad([xa, p[1], p[0]], [xb, p[1], p[0]], [xb, q[1], q[0]], [xa, q[1], q[0]], c);
    }
    if (!caps) return;
    const c = typeof col === 'function' ? col(0) : col;
    this.poly(sec.map((p) => [xb, p[1], p[0]] as V3).reverse(), c);
    this.poly(sec.map((p) => [xa, p[1], p[0]] as V3), c);
  }

  /** Vertical cylinder or cone frustum, smooth shaded. */
  cyl(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, seg: number, col: Col, cap = true, foot = 1): void {
    const i0 = this.b.count, sl = (r0 - r1) / (y1 - y0 || 1);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      this.v([cx + c * r0, y0, cz + s * r0], [c, sl, s], shade(col, foot));
      this.v([cx + c * r1, y1, cz + s * r1], [c, sl, s], col);
    }
    for (let i = 0; i < seg; i++) { const a = i0 + i * 2; this.tri(a, a + 1, a + 3); this.tri(a, a + 3, a + 2); }
    if (cap && r1 > 0.001) {
      const pts: V3[] = [];
      for (let i = 0; i < seg; i++) { const a = -(i / seg) * Math.PI * 2; pts.push([cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1]); }
      this.poly(pts, col);
    }
  }

  /** Surface of revolution about a vertical axis; profile is [radius, y] from bottom to top. */
  lathe(cx: number, cz: number, prof: [number, number][], seg: number, col: Col | ((j: number) => Col)): void {
    const i0 = this.b.count, m = prof.length;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (let j = 0; j < m; j++) {
        const p = prof[Math.max(0, j - 1)], q = prof[Math.min(m - 1, j + 1)];
        const dr = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dr, dy) || 1;
        this.v([cx + c * prof[j][0], prof[j][1], cz + s * prof[j][0]], [(c * dy) / l, -dr / l, (s * dy) / l], typeof col === 'function' ? col(j) : col);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < m - 1; j++) { const a = i0 + i * m + j, b = a + m; this.tri(a, a + 1, b + 1); this.tri(a, b + 1, b); }
  }

  sphere(cx: number, cy: number, cz: number, r: number, seg: number, rings: number, col: Col | ((i: number, j: number) => Col), sy = 1): void {
    const i0 = this.b.count;
    for (let j = 0; j <= rings; j++) {
      const ph = (j / rings) * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        this.v([cx + c * sp * r, cy - cp * r * sy, cz + s * sp * r], [c * sp, -cp, s * sp], typeof col === 'function' ? col(i, j) : col);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = i0 + j * (seg + 1) + i, b = a + seg + 1; this.tri(a, b, b + 1); this.tri(a, b + 1, a + 1); }
  }

  /** Round tube along a path (wires, pipes, handles). */
  tube(path: V3[], r: number, seg: number, col: Col): void {
    const i0 = this.b.count, m = path.length;
    for (let k = 0; k < m; k++) {
      const p = path[k], a = path[Math.max(0, k - 1)], b = path[Math.min(m - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // any vector not parallel to the tangent
      let ux = Math.abs(ty) > 0.9 ? 1 : 0, uy = Math.abs(ty) > 0.9 ? 0 : 1, uz = 0;
      let bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux;
      const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      ux = by * tz - bz * ty; uy = bz * tx - bx * tz; uz = bx * ty - by * tx;
      for (let i = 0; i <= seg; i++) {
        const an = (i / seg) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        const nx = bx * c + ux * s, ny = by * c + uy * s, nz = bz * c + uz * s;
        this.v([p[0] + nx * r, p[1] + ny * r, p[2] + nz * r], [nx, ny, nz], col);
      }
    }
    for (let k = 0; k < m - 1; k++) for (let i = 0; i < seg; i++) { const a = i0 + k * (seg + 1) + i, b = a + seg + 1; this.tri(a, b + 1, a + 1); this.tri(a, b, b + 1); }
  }

  /**
   * Smooth surface through a grid of points (rows of equal length); normals from neighbours.
   * Front face: rows advance "up", points advance "right". `two` adds the back side (darker).
   */
  grid(rows: V3[][], col: Col | ((i: number, j: number) => Col), two = false, backShade = 0.6): void {
    const R = rows.length, C = rows[0].length;
    const nrm = (j: number, i: number): V3 => {
      const a = rows[j][Math.max(0, i - 1)], b = rows[j][Math.min(C - 1, i + 1)], c = rows[Math.max(0, j - 1)][i], d = rows[Math.min(R - 1, j + 1)][i];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
      const n: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    for (const sgn of two ? [1, -1] : [1]) {
      const i0 = this.b.count;
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
        const n = nrm(j, i), c = typeof col === 'function' ? col(i, j) : col;
        this.v(rows[j][i], sgn > 0 ? n : [-n[0], -n[1], -n[2]], sgn > 0 ? c : shade(c, backShade));
      }
      for (let j = 0; j < R - 1; j++) for (let i = 0; i < C - 1; i++) {
        const a = i0 + j * C + i, b = a + 1, c = a + C, d = c + 1;
        if (sgn > 0) { this.tri(a, b, d); this.tri(a, d, c); } else { this.tri(a, d, b); this.tri(a, c, d); }
      }
    }
  }

  /**
   * Wall slab in the plane z = zf facing +z, spanning x0..x1, y0..y1, pierced by openings with real
   * reveals of depth `t` (jambs, head, sill run back to z = zf - t). This is what gives windows
   * and doors actual depth instead of painted rectangles. `reveal` colours the cut faces.
   */
  wall(x0: number, x1: number, y0: number, y1: number, zf: number, t: number, ops: Opening[], col: Col, reveal?: Col, footShade = 1): void {
    const rc = reveal ?? shade(col, 0.72);
    const xs = [x0, x1], ys = [y0, y1];
    for (const o of ops) { xs.push(o.x0, o.x1); ys.push(o.y0, o.arch ? o.y1 - o.arch : o.y1, o.y1); }
    const uniq = (a: number[], lo: number, hi: number) => [...new Set(a.filter((v) => v >= lo - 1e-6 && v <= hi + 1e-6).map((v) => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
    const X = uniq(xs, x0, x1), Y = uniq(ys, y0, y1);
    const hole = (cx: number, cy: number) => ops.some((o) => cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1);
    const span = y1 - y0 || 1;
    const cAt = (y: number): Col => (footShade === 1 ? col : shade(col, footShade + (1 - footShade) * Math.min(1, (y - y0) / Math.min(span, 1.2))));
    for (let j = 0; j < Y.length - 1; j++) {
      let run = -1;
      for (let i = 0; i <= X.length - 1; i++) {
        const solid = i < X.length - 1 && !hole((X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2);
        if (solid && run < 0) run = i;
        if (!solid && run >= 0) {
          const a = X[run], b = X[i], ca = cAt(Y[j]), cb = cAt(Y[j + 1]);
          this.quad([a, Y[j], zf], [b, Y[j], zf], [b, Y[j + 1], zf], [a, Y[j + 1], zf], [ca, ca, cb, cb]);
          run = -1;
        }
      }
    }
    for (const o of ops) {
      const zb = zf - t, ys1 = o.arch ? o.y1 - o.arch : o.y1;
      const dk = shade(rc, 0.8);
      this.quad([o.x0, o.y0, zf], [o.x0, o.y0, zb], [o.x0, ys1, zb], [o.x0, ys1, zf], [rc, dk, dk, rc]); // left jamb (faces +x)
      this.quad([o.x1, o.y0, zb], [o.x1, o.y0, zf], [o.x1, ys1, zf], [o.x1, ys1, zb], [dk, rc, rc, dk]);
      if (o.y0 > y0 + 1e-4) this.quad([o.x0, o.y0, zf], [o.x1, o.y0, zf], [o.x1, o.y0, zb], [o.x0, o.y0, zb], rc); // sill
      if (!o.arch) { this.quad([o.x0, o.y1, zb], [o.x1, o.y1, zb], [o.x1, o.y1, zf], [o.x0, o.y1, zf], shade(rc, 0.75)); continue; }
      // arched head: spandrel fill on the wall face and a curved soffit
      const N = 10, cx = (o.x0 + o.x1) / 2, hw = (o.x1 - o.x0) / 2;
      const pt = (k: number): [number, number] => { const a = Math.PI - (k / N) * Math.PI; return [cx + Math.cos(a) * hw, ys1 + Math.sin(a) * o.arch!]; };
      for (let k = 0; k < N; k++) {
        const p = pt(k), q = pt(k + 1);
        this.quad([p[0], p[1], zf], [q[0], q[1], zf], [q[0], o.y1, zf], [p[0], o.y1, zf], col);
        this.quad([p[0], p[1], zb], [q[0], q[1], zb], [q[0], q[1], zf], [p[0], p[1], zf], shade(rc, 0.78));
      }
    }
  }

  /** Total triangle count over all material slots. */
  get triangles(): number { let n = 0; for (const b of this.bufs.values()) n += b.idx.length / 3; return n; }
}
