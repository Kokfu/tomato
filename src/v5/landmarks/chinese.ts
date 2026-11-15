// Shared parts for southern-Chinese (Teochew / Hokkien) temple architecture, built with the V5 kit.
import { Kit, hex, shade, rnd } from '../kit.ts';
import type { Col, V3 } from '../kit.ts';

/** Roof surface height at plan position (x, z). */
export type Field = (x: number, z: number) => number;

/** Concave Chinese roof curve: 0 at the eave, 1 at the ridge, steeper toward the ridge. */
export const sag = (t: number) => 0.3 * t + 0.7 * Math.pow(t, 1.7);

/** Curved roof slope between an eave line (z = zE) and a ridge line (z = zR), x0..x1. */
export function roofPatch(k: Kit, f: Field, x0: number, x1: number, zE: number, zR: number, nu: number, nv: number, col: Col): void {
  const front = zR < zE;
  const rows: V3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const z = zE + ((zR - zE) * j) / nv, row: V3[] = [];
    for (let i = 0; i <= nu; i++) { const x = front ? x0 + ((x1 - x0) * i) / nu : x1 - ((x1 - x0) * i) / nu; row.push([x, f(x, z), z]); }
    rows.push(row);
  }
  k.grid(rows, col);
}

/**
 * The eave edge of a tube-tile roof: a round end cap on every tile row plus the drip board. This is
 * what gives the roof its scalloped silhouette; the rows themselves are shaded by the material.
 */
export function eaveTiles(k: Kit, f: Field, x0: number, x1: number, z: number, out: 1 | -1, cap: Col, board: Col, pitch = 0.2): void {
  const n = Math.max(1, Math.round((x1 - x0) / pitch));
  if (k.detail) {
    k.use('glazed');
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / n, y = f(x, z);
      const pts: V3[] = [];
      for (let q = 0; q <= 6; q++) { const a = (q / 6) * Math.PI; pts.push([x - Math.cos(a) * 0.075, y - 0.035 + Math.sin(a) * 0.085, z + out * 0.03]); }
      k.poly(out > 0 ? pts.reverse() : pts, cap);
    }
  }
  k.use('paint');
  const lo: V3[] = [], hi: V3[] = [], m = Math.max(2, Math.round(n / 3));
  for (let i = 0; i <= m; i++) { const x = x0 + ((x1 - x0) * i) / m, y = f(x, z); lo.push([x, y - 0.17, z + out * 0.01]); hi.push([x, y - 0.03, z + out * 0.01]); }
  k.grid(out > 0 ? [lo, hi] : [lo.slice().reverse(), hi.slice().reverse()], board);
}

/** Ridge beam along a path that runs in +x: front, back and top faces. `front` may carry atlas UVs. */
export function ridgeBeam(k: Kit, path: V3[], w: number, h: number, col: Col, uv?: [number, number, number, number]): void {
  const n = path.length;
  const off = (dz: number, dy: number) => path.map((p) => [p[0], p[1] + dy, p[2] + dz] as V3);
  k.use('paint');
  k.grid([off(w / 2, h), off(-w / 2, h)], shade(col, 1.1));
  if (!uv) {
    k.grid([off(w / 2, 0), off(w / 2, h)], col);
    k.grid([off(-w / 2, 0).reverse(), off(-w / 2, h).reverse()], shade(col, 0.85));
    return;
  }
  k.use('atlas');
  const len = path[n - 1][0] - path[0][0];
  for (const s of [1, -1]) for (let i = 0; i < n - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ua = uv[0] + ((a[0] - path[0][0]) / len) * (uv[2] - uv[0]), ub = uv[0] + ((b[0] - path[0][0]) / len) * (uv[2] - uv[0]);
    const z = s * w / 2;
    if (s > 0) k.poly([[a[0], a[1], a[2] + z], [b[0], b[1], b[2] + z], [b[0], b[1] + h, b[2] + z], [a[0], a[1] + h, a[2] + z]], [1, 1, 1], [[ua, uv[1]], [ub, uv[1]], [ub, uv[3]], [ua, uv[3]]]);
    else k.poly([[b[0], b[1], b[2] + z], [a[0], a[1], a[2] + z], [a[0], a[1] + h, a[2] + z], [b[0], b[1] + h, b[2] + z]], [0.8, 0.8, 0.8], [[ub, uv[1]], [ua, uv[1]], [ua, uv[3]], [ub, uv[3]]]);
  }
}

/** Upswept swallow-tail ridge end: a tapering blade curving up and out from `base` toward dir (+1/-1 in x). */
export function swallowTail(k: Kit, base: V3, dir: 1 | -1, len: number, rise: number, w: number, h: number, col: Col): void {
  const N = k.detail ? 7 : 3;
  const top: V3[] = [], bot: V3[] = [], topB: V3[] = [], botB: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = base[0] + dir * len * t, y = base[1] + rise * t * t * (0.6 + 0.4 * t), hh = h * (1 - 0.8 * t), ww = (w / 2) * (1 - 0.85 * t);
    top.push([x, y + hh, base[2] + ww]); bot.push([x, y, base[2] + ww]); topB.push([x, y + hh, base[2] - ww]); botB.push([x, y, base[2] - ww]);
  }
  k.use('paint');
  const fwd = dir > 0;
  k.grid(fwd ? [bot, top] : [bot.slice().reverse(), top.slice().reverse()], col);
  k.grid(fwd ? [botB.slice().reverse(), topB.slice().reverse()] : [botB, topB], shade(col, 0.85));
  k.grid(fwd ? [top, topB] : [top.slice().reverse(), topB.slice().reverse()], shade(col, 1.12));
  k.grid(fwd ? [botB, bot] : [botB.slice().reverse(), bot.slice().reverse()], shade(col, 0.6));
}

/** Stylised cut-ceramic ridge dragon facing dir, length about 1.4 * s. */
export function ridgeDragon(k: Kit, x: number, y: number, z: number, dir: 1 | -1, s: number): void {
  const body: V3[] = [];
  const N = k.detail ? 12 : 5;
  for (let i = 0; i <= N; i++) { const t = i / N; body.push([x - dir * (1 - t) * 1.25 * s, y + (0.16 + Math.sin(t * Math.PI * 2.2) * 0.14 + t * 0.34) * s, z + Math.sin(t * 5) * 0.03 * s]); }
  k.use('glazed');
  k.tube(body, 0.075 * s, 6, hex(0x2f9a63));
  const h = body[N];
  k.sphere(h[0] + dir * 0.06 * s, h[1] + 0.02 * s, h[2], 0.12 * s, 7, 5, hex(0x3fae74), 0.85);
  k.use('gold');
  if (k.detail) {
    for (let i = 2; i < N; i += 2) { const p = body[i]; k.cyl(p[0], p[2], p[1] + 0.05 * s, p[1] + 0.2 * s, 0.035 * s, 0, 4, hex(0xe2b93a), false); }
    for (const sz of [0.05, -0.05]) k.cyl(h[0] - dir * 0.03 * s, h[2] + sz * s, h[1] + 0.08 * s, h[1] + 0.3 * s, 0.025 * s, 0, 4, hex(0xe2b93a), false);
    k.use('paint');
    k.sphere(h[0] + dir * 0.2 * s, h[1] - 0.02 * s, h[2], 0.045 * s, 5, 3, hex(0xd23a2c));
  }
  // tail fan
  k.use('glazed');
  const t0 = body[0];
  const fan = (dz: number): V3[] => [[t0[0], t0[1], t0[2] + dz], [t0[0] - dir * 0.3 * s, t0[1] + 0.34 * s, t0[2] + dz], [t0[0] - dir * 0.05 * s, t0[1] + 0.42 * s, t0[2] + dz]];
  k.poly(dir > 0 ? fan(0.02).reverse() : fan(0.02), hex(0x2e62b8));
  k.poly(dir > 0 ? fan(-0.02) : fan(-0.02).reverse(), hex(0x2e62b8, 0.8));
}

/** Centre ridge finial: flaming pearl / small pagoda between the dragons. */
export function ridgePearl(k: Kit, x: number, y: number, z: number, s: number): void {
  k.use('gold');
  k.lathe(x, z, [[0.16 * s, y], [0.2 * s, y + 0.08 * s], [0.1 * s, y + 0.16 * s], [0.14 * s, y + 0.26 * s], [0.06 * s, y + 0.36 * s], [0.09 * s, y + 0.46 * s], [0.004, y + 0.72 * s]], k.detail ? 8 : 5, hex(0xe2b93a));
  k.use('paint');
  k.sphere(x, y + 0.56 * s, z, 0.1 * s, 7, 5, hex(0xd23a2c));
}

/** Round red paper lantern with gold caps, tassel and (optionally) a paper wish tag below. */
export function lantern(k: Kit, x: number, y: number, z: number, r: number, tag?: [number, number, number, number]): void {
  k.use('glow');
  k.sphere(x, y, z, r, k.detail ? 8 : 5, k.detail ? 5 : 3, hex(0xc81f17), 0.86);
  k.use('gold');
  k.cyl(x, z, y + r * 0.78, y + r * 0.98, r * 0.42, r * 0.36, 6, hex(0xd9b23c), true);
  k.cyl(x, z, y - r * 0.98, y - r * 0.78, r * 0.36, r * 0.42, 6, hex(0xd9b23c), false);
  if (!k.detail) return;
  if (tag) {
    k.use('atlas');
    const w = r * 0.7, h = r * 2.2, y1 = y - r * 1.05;
    k.poly([[x - w / 2, y1 - h, z], [x + w / 2, y1 - h, z], [x + w / 2, y1, z], [x - w / 2, y1, z]], [1, 1, 1], [[tag[0], tag[1]], [tag[2], tag[1]], [tag[2], tag[3]], [tag[0], tag[3]]]);
  } else {
    k.use('paint');
    k.cyl(x, z, y - r * 1.9, y - r * 0.98, 0.02, 0.012, 4, hex(0xd9b23c), false);
  }
}

/** A sagging wire with lanterns hung from it. */
export function lanternString(k: Kit, a: V3, b: V3, n: number, r: number, droop: number, tag?: [number, number, number, number]): void {
  const path: V3[] = [], M = 10;
  const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - droop * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i <= M; i++) path.push(at(i / M));
  k.use('wire');
  k.tube(path, 0.008, 3, hex(0x222222));
  for (let i = 0; i < n; i++) { const p = at((i + 0.5) / n); lantern(k, p[0], p[1] - r * 1.05, p[2], r, tag); }
}

/** Round timber column on a stone drum base. */
export function column(k: Kit, x: number, z: number, y0: number, y1: number, r: number, col: Col): void {
  k.use('stone');
  k.lathe(x, z, [[r * 1.5, y0], [r * 1.6, y0 + 0.1], [r * 1.25, y0 + 0.2], [r * 1.05, y0 + 0.24]], k.detail ? 10 : 6, hex(0x9a988f));
  k.use('paint');
  k.cyl(x, z, y0 + 0.24, y1, r, r * 0.94, k.detail ? 12 : 6, col, false, 0.8);
}

/** Stone guardian lion on a tall carved pedestal, facing +z. */
export function lion(k: Kit, x: number, z: number): void {
  const st = hex(0x6f726c);
  k.at({ x, z }, () => {
    k.use('stone');
    k.box(-0.42, 0.42, 0, 0.2, -0.42, 0.42, shade(st, 0.85), 'y-', 0.7);
    k.box(-0.33, 0.33, 0.2, 1.12, -0.33, 0.33, st, 'y-');
    k.box(-0.4, 0.4, 1.12, 1.27, -0.4, 0.4, shade(st, 1.08), '');
    if (!k.detail) { k.box(-0.2, 0.2, 1.27, 2.1, -0.3, 0.3, st, 'y-'); return; }
    for (const s of [1, -1]) k.box(-0.22, 0.22, 0.36, 0.98, s > 0 ? 0.33 : -0.36, s > 0 ? 0.36 : -0.33, shade(st, 0.78), 'y-y+');
    const c = shade(st, 1.05);
    k.sphere(0, 1.55, -0.13, 0.28, 9, 6, c, 0.95);
    k.sphere(0, 1.7, 0.1, 0.22, 9, 6, c, 1.3);
    k.sphere(0, 2.02, 0.09, 0.26, 9, 6, shade(st, 0.84), 0.95);
    k.sphere(0, 2.04, 0.2, 0.19, 9, 6, c);
    k.box(-0.1, 0.1, 1.9, 2.02, 0.3, 0.44, c, '');
    for (const s of [1, -1]) k.box(s * 0.13 - 0.055, s * 0.13 + 0.055, 1.27, 1.64, 0.14, 0.28, c, 'y-');
    for (const s of [1, -1]) k.sphere(s * 0.17, 2.2, 0.1, 0.07, 5, 4, shade(st, 0.9));
    k.use('fabric');
    k.lathe(0, 0.1, [[0.21, 1.8], [0.25, 1.85], [0.21, 1.9]], 8, hex(0xc8281e));
    k.sphere(0, 1.76, 0.3, 0.07, 6, 4, hex(0xc8281e));
  });
}

/** Three-legged bronze censer under a two-tier hexagonal red canopy. */
export function censer(k: Kit, x: number, z: number): void {
  const gold = hex(0xc9a23a), red = hex(0xc8281e);
  k.at({ x, z }, () => {
    k.use('gold');
    k.lathe(0, 0, [[0.5, 0.0], [0.5, 0.12], [0.34, 0.18]], 10, shade(gold, 0.8));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; k.lathe(Math.cos(a) * 0.3, Math.sin(a) * 0.3, [[0.07, 0.16], [0.1, 0.42], [0.06, 0.6]], 6, gold); }
    k.lathe(0, 0, [[0.1, 0.54], [0.4, 0.66], [0.55, 0.9], [0.5, 1.1], [0.6, 1.18], [0.6, 1.26], [0.45, 1.26], [0.4, 1.14]], 14, (j) => (j === 4 || j === 5 ? shade(gold, 1.15) : gold));
    if (k.detail) for (const s of [1, -1]) k.tube([[s * 0.5, 0.98, 0], [s * 0.76, 1.1, 0], [s * 0.82, 1.36, 0], [s * 0.64, 1.52, 0]], 0.045, 6, gold);
    k.use('concrete');
    k.cyl(0, 0, 1.14, 1.2, 0.4, 0.4, 12, hex(0x9a9a92), true);
    k.use('paint');
    const hexPt = (r: number, y: number, i: number): V3 => { const a = (i / 6) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
    for (let i = 0; i < 6; i++) { const p = hexPt(0.68, 0, i); k.cyl(p[0], p[2], 0, 2.42, 0.03, 0.03, 5, red, false); }
    const tier = (r0: number, y0: number, r1: number, y1: number, lift: number) => {
      for (let i = 0; i < 6; i++) {
        const a = hexPt(r0, y0 + lift, i), b = hexPt(r0, y0 + lift, i + 1), c = hexPt(r1, y1, i + 1), d = hexPt(r1, y1, i);
        const m: V3 = [(a[0] + b[0]) / 2 * 0.96, y0, (a[2] + b[2]) / 2 * 0.96];
        k.poly([b, m, d], shade(red, 0.9 + 0.1 * (i % 2))); k.poly([m, a, d], shade(red, 0.9 + 0.1 * (i % 2))); k.poly([b, d, c], shade(red, 0.95));
        k.poly([a, m, [0, y0 + 0.02, 0]], shade(red, 0.5)); k.poly([m, b, [0, y0 + 0.02, 0]], shade(red, 0.5));
      }
    };
    tier(1.1, 2.4, 0.42, 2.8, 0.14);
    k.cyl(0, 0, 2.8, 2.98, 0.4, 0.4, 6, shade(red, 0.8), false);
    tier(0.82, 2.96, 0.3, 3.32, 0.12);
    k.cyl(0, 0, 3.32, 3.48, 0.28, 0.28, 6, shade(red, 0.8), false);
    tier(0.56, 3.46, 0.02, 3.86, 0.1);
    k.use('gold');
    k.lathe(0, 0, [[0.05, 3.82], [0.09, 3.92], [0.03, 4.02], [0.06, 4.1], [0.004, 4.3]], 6, gold);
  });
}

/** Potted shrub built from many small leaf masses; flowers adds bougainvillea-like colour. */
export function plant(k: Kit, x: number, z: number, s: number, flowers: boolean, seed = 1): void {
  k.use('paint');
  k.lathe(x, z, [[0.2 * s, 0], [0.3 * s, 0.46 * s], [0.33 * s, 0.5 * s], [0.27 * s, 0.5 * s]], 10, hex(0x7a4a34));
  k.use('timber');
  k.cyl(x, z, 0.45 * s, 1.0 * s, 0.035 * s, 0.02 * s, 5, hex(0x4a3524), false);
  k.use('foliage');
  const n = k.detail ? 26 : 5;
  for (let i = 0; i < n; i++) {
    const a = rnd(seed, i, 1) * Math.PI * 2, u = rnd(seed, i, 2), v = rnd(seed, i, 3);
    const rad = (0.12 + 0.4 * Math.sqrt(u)) * s, y = (0.72 + v * 0.95) * s, r = (0.1 + rnd(seed, i, 4) * 0.12) * s * (k.detail ? 1 : 2.4);
    const fl = flowers && rnd(seed, i, 5) < 0.4;
    k.sphere(x + Math.cos(a) * rad * (1 - v * 0.5), y, z + Math.sin(a) * rad * (1 - v * 0.5), r, 5, 3, fl ? hex(0xc23a6e, 0.9 + rnd(seed, i, 6) * 0.3) : hex(0x2c6a34, 0.6 + rnd(seed, i, 6) * 0.7), 0.7);
  }
}

/** Raised tile rows down a roof slope: gives the eave and the slope their real ribbed profile near the viewer. */
export function roofRibs(k: Kit, f: Field, x0: number, x1: number, zE: number, zR: number, col: Col, pitch = 0.2): void {
  if (!k.detail) return;
  const n = Math.max(1, Math.round((x1 - x0) / pitch));
  k.use('glazed');
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n, path: V3[] = [];
    for (let j = 0; j <= 4; j++) { const z = zE + ((zR - zE) * j) / 4; path.push([x, f(x, z) + 0.012, z]); }
    k.tube(path, 0.05, 4, col);
  }
}
