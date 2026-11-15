// Reusable parts for southern-Chinese (Minnan / Teochew) temple architecture and its street
// furniture: curved tiled roofs as true geometry, ornamented ridges with swallow-tail ends, hip
// roofs with upturned corners, lanterns. Everything is original procedural geometry.
import { MeshBuilder, bez, hex, mix, rnd, shade } from './mesh.ts';
import type { Col, V3 } from './mesh.ts';

/** Roof height as a function of plan position. */
export type Field = (x: number, z: number) => number;
/** Concave roof profile: flat at the eave, steep at the ridge (t = 0 eave .. 1 ridge). */
export const sag = (t: number) => 0.42 * t + 0.58 * t * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface TileColors { base: Col; rib: Col; trim: Col }

/** Roof surface over the plan quad c00 (eave, left) - c10 (eave, right) - c11 (top, right) - c01 (top, left). */
export function roofQuad(b: MeshBuilder, f: Field, c00: [number, number], c10: [number, number], c11: [number, number], c01: [number, number], nu: number, nv: number, color: Col): void {
  const rows: V3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row: V3[] = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const x = (c00[0] * (1 - u) + c10[0] * u) * (1 - v) + (c01[0] * (1 - u) + c11[0] * u) * v;
      const z = (c00[1] * (1 - u) + c10[1] * u) * (1 - v) + (c01[1] * (1 - u) + c11[1] * u) * v;
      row.push([x, f(x, z), z]);
    }
    rows.push(row);
  }
  // Slightly darker toward the ridge and at alternate courses: reads as rows of tiles from afar.
  b.grid(rows, (_i, j) => shade(color, 0.9 + 0.1 * (1 - j / nv) + (j % 2 ? 0.03 : 0)), { dir: [0, 1, 0] });
}

/** Tile ribs: raised rolls following the roof from (x0, z0) to (x1, z1), one per entry of `lines`. */
export function roofRibs(b: MeshBuilder, f: Field, lines: [number, number, number, number][], seg: number, color: Col, w = 0.11, h = 0.055): void {
  if (!b.detail) return;
  for (const [x0, z0, x1, z1] of lines) {
    if (Math.hypot(x1 - x0, z1 - z0) < 0.25) continue;
    const path: V3[] = [];
    for (let i = 0; i <= seg; i++) { const t = i / seg, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; path.push([x, f(x, z) + 0.005, z]); }
    b.sweep(path, () => [[-w / 2, 0], [0, h], [w / 2, 0]], color, false, false);
  }
}

/** Vertical trim hanging from an eave line (the row of tile ends), between two plan points. */
export function eaveTrim(b: MeshBuilder, f: Field, a: [number, number], c: [number, number], out: V3, n: number, drop: number, color: Col): void {
  const top: V3[] = [], bot: V3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t, y = f(x, z); top.push([x, y + 0.03, z]); bot.push([x, y - drop, z]); }
  b.grid([bot, top], color, { dir: out }, false);
}

const CHIPS = [hex(0x2e62b8), hex(0xe2b93a), hex(0xc23b2e), hex(0xe88aa6), hex(0x3fa35c), hex(0xf0ece0), hex(0x2a9aa8)];

/**
 * Ornamented ridge: a slab following `pts`, white-washed body with a band of coloured cut-ceramic
 * panels, a glazed coping and (full detail) small coloured ornaments on top.
 */
export function ridgeBeam(b: MeshBuilder, pts: V3[], h: number, t: number, coping: Col, seed: number, ornaments = true, chips = true): void {
  const body = hex(0xe9e4d4);
  b.sweep(pts, () => [[-t / 2, 0], [t / 2, 0], [t / 2, h], [-t / 2, h]], (edge, i) => (edge === 2 ? coping : edge === 1 || edge === 3 ? (!chips ? shade(coping, 1.5) : b.detail ? CHIPS[(i * 3 + seed + edge) % CHIPS.length] : mix(body, CHIPS[0], 0.35)) : chips ? body : shade(coping, 1.3)), true, true, false);
  if (!b.detail || !ornaments) return;
  // Cut-ceramic flowers and figures along the top: small faceted lumps in the traditional colours.
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
    let s = 0.22 - (run % 0.44);
    for (; s < len; s += 0.44) {
      const k = s / len, x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k + h, z = a[2] + (c[2] - a[2]) * k;
      const n = Math.floor(rnd(seed, i, Math.round(s * 10)) * CHIPS.length);
      const r = 0.07 + rnd(seed + 5, i, Math.round(s * 10)) * 0.06;
      b.sphere(x, y + r * 1.1, z, r, 4, 2, CHIPS[n], 1.5);
    }
    run += len;
  }
}

/** Forked, upswept ridge end (swallow tail): two tapering horns curving up and outward from `base`. */
export function swallowTail(b: MeshBuilder, base: V3, dx: number, dz: number, len: number, rise: number, w: number, h: number, color: Col): void {
  const horn = (l: number, r: number, y0: number) => {
    const p0: V3 = [base[0], base[1] + y0, base[2]], p1: V3 = [base[0] + dx * l * 0.7, base[1] + y0 + r * 0.12, base[2] + dz * l * 0.7], p2: V3 = [base[0] + dx * l, base[1] + y0 + r, base[2] + dz * l];
    const n = b.detail ? 5 : 3;
    const path: V3[] = [];
    for (let i = 0; i <= n; i++) path.push(bez(p0, p1, p2, i / n));
    b.sweep(path, (i) => { const s = 1 - 0.82 * (i / n); return [[-w * s / 2, 0], [w * s / 2, 0], [w * s / 2, h * s], [-w * s / 2, h * s]]; }, color);
  };
  horn(len, rise, 0);
  if (b.detail) horn(len * 0.72, rise * 0.55, -h * 0.15);
}

/** Dragon for a ridge: an S-curved body with a raised head, facing along +dir. Low-polygon, original. */
export function ridgeDragon(b: MeshBuilder, x: number, y: number, z: number, dir: 1 | -1, length: number): void {
  if (!b.detail) return;
  const green = hex(0x2f9a63), gold = hex(0xe0b23c), blue = hex(0x2e62b8), red = hex(0xc8352a);
  const n = 9, path: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // tail (t = 0) low and away from the centre, body arching twice, neck rising to the head (t = 1)
    path.push([x - dir * length * (1 - t), y + 0.12 + Math.sin(t * Math.PI * 2.2) * 0.16 + t * t * 0.42, z + Math.sin(t * Math.PI * 3) * 0.05]);
  }
  b.tube(path, (i) => 0.035 + 0.075 * Math.sin((i / n) * Math.PI * 0.9 + 0.25), 5, (_k, i) => (i % 2 ? green : blue));
  const hd = path[n];
  b.box(hd[0] - 0.09 + dir * 0.08, hd[0] + 0.09 + dir * 0.08, hd[1] - 0.06, hd[1] + 0.1, hd[2] - 0.07, hd[2] + 0.07, gold, []);
  b.box(hd[0] + dir * 0.17 - 0.05, hd[0] + dir * 0.17 + 0.05, hd[1] - 0.05, hd[1] + 0.03, hd[2] - 0.05, hd[2] + 0.05, red, []);
  // horns and back fins
  b.flat([[hd[0], hd[1] + 0.1, hd[2]], [hd[0] - dir * 0.2, hd[1] + 0.3, hd[2]], [hd[0] - dir * 0.05, hd[1] + 0.1, hd[2]]], gold, [0, 0, 1]);
  for (let i = 2; i < n; i += 2) b.flat([[path[i][0] - 0.07, path[i][1] + 0.07, path[i][2]], [path[i][0], path[i][1] + 0.24, path[i][2]], [path[i][0] + 0.07, path[i][1] + 0.07, path[i][2]]], gold, [0, 0, 1]);
}

/** Pearl / gourd finial for the middle of a ridge. */
export function ridgePearl(b: MeshBuilder, x: number, y: number, z: number, s = 1): void {
  const gold = hex(0xe0b23c), red = hex(0xd23a2c);
  b.lathe(x, z, [[0.16 * s, y], [0.2 * s, y + 0.1 * s], [0.08 * s, y + 0.22 * s], [0.15 * s, y + 0.36 * s], [0.05 * s, y + 0.5 * s], [0.09 * s, y + 0.6 * s], [0.005, y + 0.78 * s]], b.detail ? 7 : 4, (_i, j) => (j === 3 || j === 5 ? red : gold));
}

export interface HipSpec { cx: number; cz: number; hx: number; hz: number; yEave: number; rise: number; ridgeHalf: number; lift: number }
/** Height field of a hip roof whose ridge runs along X, with upturned eave corners. */
export function hipField(s: HipSpec): Field {
  return (x, z) => {
    const ax = Math.abs(x - s.cx), az = Math.abs(z - s.cz);
    const t = clamp01(Math.min((s.hx - ax) / Math.max(1e-6, s.hx - s.ridgeHalf), (s.hz - az) / s.hz));
    return s.yEave + s.rise * sag(t) + s.lift * Math.pow(clamp01(ax / s.hx), 3) * Math.pow(clamp01(az / s.hz), 3);
  };
}
/** Hip roof (four curved tiled slopes, hip rolls, ridge with swallow tails). */
export function hipRoof(b: MeshBuilder, s: HipSpec, c: TileColors, opts: { pitch?: number; ridgeH?: number; tails?: number; seed?: number; pearl?: boolean; plain?: boolean; chips?: boolean } = {}): Field {
  const f = hipField(s), { cx, cz, hx, hz, ridgeHalf: rh } = s;
  const n = b.detail ? 6 : 3, m = b.detail ? 4 : 2;
  for (const sg of [1, -1]) {
    roofQuad(b, f, [cx - hx, cz + sg * hz], [cx + hx, cz + sg * hz], [cx + rh, cz], [cx - rh, cz], n, m, c.base);
    roofQuad(b, f, [cx + sg * hx, cz - hz], [cx + sg * hx, cz + hz], [cx + sg * rh, cz], [cx + sg * rh, cz], n, m, shade(c.base, 0.93));
    eaveTrim(b, f, [cx - hx, cz + sg * hz], [cx + hx, cz + sg * hz], [0, 0, sg], n, 0.12, c.trim);
    eaveTrim(b, f, [cx + sg * hx, cz - hz], [cx + sg * hx, cz + hz], [sg, 0, 0], n, 0.12, c.trim);
  }
  const pitch = opts.pitch ?? 0.3;
  const lines: [number, number, number, number][] = [];
  for (let x = -hx + pitch / 2; x < hx; x += pitch) {
    const tm = Math.min(1, (hx - Math.abs(x)) / (hx - rh));
    for (const sg of [1, -1]) lines.push([cx + x, cz + sg * hz, cx + x, cz + sg * hz * (1 - tm)]);
  }
  for (let z = -hz + pitch / 2; z < hz; z += pitch) {
    const tz = (hz - Math.abs(z)) / hz;
    for (const sg of [1, -1]) lines.push([cx + sg * hx, cz + z, cx + sg * (hx - (hx - rh) * tz), cz + z]);
  }
  roofRibs(b, f, lines, 3, c.rib);
  if (opts.plain) {
    // Sheet-metal roof: plain ridge and hip cappings, no ornament.
    for (const sx of [1, -1]) for (const sz of [1, -1]) b.sweep([[cx + sx * hx, f(cx + sx * hx, cz + sz * hz) + 0.01, cz + sz * hz], [cx + sx * rh, f(cx + sx * rh, cz) + 0.01, cz]], () => [[-0.12, 0], [0.12, 0], [0, 0.1]], c.trim, false, false);
    b.sweep([[cx - rh, f(cx - rh, cz) + 0.01, cz], [cx + rh, f(cx + rh, cz) + 0.01, cz]], () => [[-0.14, 0], [0.14, 0], [0, 0.12]], c.trim, false, false);
    return f;
  }
  // Hip rolls from each corner up to the ridge end, ending in a small upturned tip.
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const path: V3[] = [];
    const k = b.detail ? 5 : 2;
    for (let i = 0; i <= k; i++) { const t = i / k, x = cx + sx * (hx + (rh - hx) * t), z = cz + sz * hz * (1 - t); path.push([x, f(x, z) + 0.01, z]); }
    b.sweep(path, () => [[-0.09, 0], [0.09, 0], [0.07, 0.16], [-0.07, 0.16]], hex(0xe9e4d4));
    const d = Math.hypot(hx - rh, hz);
    swallowTail(b, [path[0][0], path[0][1] + 0.02, path[0][2]], (sx * (hx - rh)) / d, (sz * hz) / d, 0.42, 0.34, 0.14, 0.12, c.trim);
  }
  const rp: V3[] = [];
  const rn = b.detail ? 4 : 1;
  for (let i = 0; i <= rn; i++) { const x = cx - rh + (2 * rh * i) / rn; rp.push([x, f(x, cz) - 0.02 + Math.pow(Math.abs((2 * i) / rn - 1), 2.2) * (opts.tails ?? 0.2) * 0.5, cz]); }
  const rhh = opts.ridgeH ?? 0.36;
  ridgeBeam(b, rp, rhh, 0.2, c.trim, opts.seed ?? 3, opts.chips !== false, opts.chips !== false);
  const tl = opts.tails ?? 0.2;
  if (tl > 0) for (const sg of [1, -1]) { const e = sg > 0 ? rp[rn] : rp[0]; swallowTail(b, [e[0], e[1] + rhh * 0.3, e[2]], sg, 0, 0.7 * tl / 0.2 * 0.6, tl * 2.4, 0.17, rhh * 0.7, c.trim); }
  if (opts.pearl) ridgePearl(b, cx, f(cx, cz) + rhh - 0.02, cz, 0.8);
  return f;
}

/** Hanging red lantern (body centred at y). */
export function lantern(b: MeshBuilder, x: number, y: number, z: number, r: number, tag = true): void {
  const red = hex(0xe02a1c), gold = hex(0xe3b341);
  b.sphere(x, y, z, r, 6, 3, (_i, j) => (j === 0 || j === 3 ? shade(red, 0.75) : red), 0.86);
  b.lathe(x, z, [[r * 0.42, y + r * 0.78], [r * 0.42, y + r * 1.02]], 5, gold);
  b.lathe(x, z, [[r * 0.4, y - r * 1.0], [r * 0.4, y - r * 0.78]], 5, gold);
  if (tag) b.flat([[x - r * 0.3, y - r * 1.0, z], [x + r * 0.3, y - r * 1.0, z], [x + r * 0.3, y - r * 2.6, z], [x - r * 0.3, y - r * 2.6, z]], hex(0xf3ead8), [0, 0, 1]);
}
/** A sagging string of lanterns between two points. */
export function lanternString(b: MeshBuilder, a: V3, c: V3, count: number, r: number, sagM = 0.25, tag = true): void {
  if (!b.detail) return;
  const pts: V3[] = [];
  for (let i = 0; i <= count + 1; i++) { const t = i / (count + 1); pts.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sagM * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t]); }
  const dark = hex(0x2a2522);
  // The cord: a thin double-sided ribbon.
  b.grid([pts.map((p) => [p[0], p[1] + 0.012, p[2]] as V3), pts.map((p) => [p[0], p[1] - 0.012, p[2]] as V3)], dark, { dir: [c[2] - a[2], 0, -(c[0] - a[0])] }, false);
  for (let i = 1; i <= count; i++) lantern(b, pts[i][0], pts[i][1] - r * 1.15, pts[i][2], r, tag);
}
