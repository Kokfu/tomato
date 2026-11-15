// V5 street surface and street-level dressing for the Carpenter Street section.
import { Kit, hex, shade, rnd } from './kit.ts';
import type { Col, V3 } from './kit.ts';
import { STREET } from './geo.ts';
import { lanternString } from './landmarks/chinese.ts';

export type HeightFn = (x: number, z: number) => number;

/** Asphalt carriageway following the mapped centre line and the terrain, with a slight crown. */
export function buildRoad(k: Kit, h: HeightFn, halfWidth = 6.2): void {
  // resample the centre line every ~2.5 m, extended a little past both ends
  const pts: [number, number][] = [];
  const ext = (a: [number, number], b: [number, number], d: number): [number, number] => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + ((a[0] - b[0]) / l) * d, a[1] + ((a[1] - b[1]) / l) * d]; };
  const line = [ext(STREET[0], STREET[1], 3), ...STREET, ext(STREET[STREET.length - 1], STREET[STREET.length - 2], 5)];
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5));
    for (let j = i === 1 ? 0 : 1; j <= n; j++) pts.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
  }
  const rows: V3[][] = [[], [], []];
  const c = hex(0x6b6a67);
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
    for (let s = 0; s < 3; s++) { const o = (s - 1) * halfWidth, x = p[0] + nx * o, z = p[1] + nz * o; rows[s].push([x, h(p[0], p[1]) + 0.035 + (s === 1 ? 0.035 : 0), z]); }
  });
  k.use('asphalt');
  // rows: left, centre, right of the direction of travel; grid front = right x up, so order them to face up
  k.grid([rows[2], rows[1], rows[0]], (i, j) => shade(c, j === 1 ? 1.0 : 0.92));
}

/** Kerb, covered monsoon drain and gratings in front of one lot (lot frame, y = 0 at road level). */
export function buildApron(k: Kit, w: number, seed: number): void {
  const KERB = 0.14;
  k.use('stone');
  k.prism([[0, 0], [0.24, 0], [0.24, KERB - 0.02], [0.22, KERB], [0, KERB]], 0, w, hex(0x9a988e), false);
  // drain: concrete slabs with finger gaps, one cast-iron grating per lot
  const z0 = 0.3, z1 = 0.78, y = 0.045;
  const grate = Math.floor(rnd(seed, 3) * Math.max(1, Math.floor(w / 0.92)));
  let i = 0;
  for (let x = 0.02; x < w - 0.3; x += 0.92, i++) {
    const x1 = Math.min(w - 0.02, x + 0.89);
    if (i === grate && k.detail) {
      k.use('paint');
      const g = hex(0x2f3134);
      k.box(x, x1, y - 0.02, y, z0, z0 + 0.04, g, 'y-'); k.box(x, x1, y - 0.02, y, z1 - 0.04, z1, g, 'y-');
      for (let q = x + 0.03; q < x1; q += 0.075) k.box(q, q + 0.03, y - 0.02, y, z0 + 0.04, z1 - 0.04, g, 'y-z+z-');
      k.use('concrete');
      k.quad([x, y - 0.3, z0], [x1, y - 0.3, z0], [x1, y - 0.3, z1], [x, y - 0.3, z1], hex(0x1c1d1c));
    } else {
      k.use('concrete');
      k.box(x, x1, y - 0.06, y, z0, z1, hex(0x8f8d86, 0.9 + rnd(seed, i) * 0.2), 'y-');
    }
  }
  k.use('concrete');
  k.quad([0, y - 0.045, 0.24], [w, y - 0.045, 0.24], [w, y - 0.045, 0.32], [0, y - 0.045, 0.32], hex(0x77756f));
}

/** Tapered steel street lamp with an outreach arm. Origin at the pole foot, arm toward +z. */
export function lampPost(k: Kit): void {
  k.use('paint');
  const c = hex(0x5d6266);
  k.cyl(0, 0, 0, 0.4, 0.085, 0.07, 10, shade(c, 0.9), false, 0.7);
  k.cyl(0, 0, 0.4, 6.6, 0.055, 0.035, 10, c, false);
  k.tube([[0, 6.55, 0], [0, 6.95, 0.25], [0, 7.05, 1.0], [0, 7.02, 1.5]], 0.035, 6, c);
  k.box(-0.12, 0.12, 6.95, 7.03, 1.4, 2.0, shade(c, 1.2), '');
  k.use('glow');
  k.box(-0.09, 0.09, 6.935, 6.95, 1.48, 1.94, hex(0xc9cbc4, 0.4), 'y+');
}

/** Overhead utility cables slung along a facade line between brackets. */
export function cables(k: Kit, a: V3, b: V3, n: number, seed: number): void {
  k.use('wire');
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]), spans = Math.max(1, Math.round(len / 5.2));
  for (let c = 0; c < n; c++) {
    for (let s = 0; s < spans; s++) {
      const path: V3[] = [];
      const droop = 0.12 + rnd(seed, c, s) * 0.14;
      for (let i = 0; i <= 6; i++) { const t = (s + i / 6) / spans, u = i / 6; path.push([a[0] + (b[0] - a[0]) * t, a[1] + c * 0.09 - droop * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * t]); }
      k.tube(path, 0.009, 3, hex(0x1b1b1b));
    }
  }
}

/** A small hatchback, about 3.7 m long, facing +x. Lofted from rounded cross-sections. */
export function car(k: Kit, body: Col): void {
  // stations: [x, half width, sill y, belt y, roof y (0 = bonnet / boot, no cabin), cabin tumble-home]
  const st: [number, number, number, number, number, number][] = [
    [-1.84, 0.5, 0.42, 0.66, 0, 0], [-1.8, 0.68, 0.34, 0.8, 0, 0], [-1.66, 0.76, 0.28, 0.9, 0, 0], [-1.4, 0.79, 0.25, 0.96, 1.12, 0.05], [-1.18, 0.8, 0.24, 0.98, 1.4, 0.12],
    [-0.7, 0.8, 0.24, 0.98, 1.46, 0.13], [0.0, 0.8, 0.24, 0.97, 1.46, 0.13], [0.35, 0.8, 0.24, 0.96, 1.42, 0.13], [0.86, 0.79, 0.24, 0.93, 0.98, 0.06],
    [1.3, 0.77, 0.26, 0.86, 0, 0], [1.66, 0.73, 0.3, 0.78, 0, 0], [1.82, 0.64, 0.36, 0.7, 0, 0], [1.86, 0.48, 0.42, 0.62, 0, 0],
  ];
  const ring = (s: typeof st[number]): V3[] => {
    const [x, hw, sill, belt, roof, tumble] = s, top = roof || belt + 0.03, cw = hw - tumble - (roof ? 0.02 : 0.1), out: V3[] = [];
    // sill, bulging flank, shoulder, glass line, rounded roof
    const half: [number, number][] = [[hw - 0.05, sill], [hw, sill + 0.12], [hw + 0.012, belt * 0.72], [hw - 0.02, belt], [cw, roof ? belt + (top - belt) * 0.9 : top - 0.01], [cw * 0.8, top + 0.02], [cw * 0.4, top + 0.045], [0, top + 0.05]];
    for (const [z, y] of half) out.push([x, y, -z]);
    for (let i = half.length - 2; i >= 0; i--) out.push([x, half[i][1], half[i][0]]);
    return out;
  };
  const rings = st.map(ring);
  k.use('paint');
  k.grid(rings, body);
  k.poly(rings[0], shade(body, 0.8));
  k.poly(rings[rings.length - 1].slice().reverse(), shade(body, 0.9));
  k.use('concrete');
  k.quad([-1.7, 0.25, -0.72], [1.7, 0.25, -0.72], [1.7, 0.25, 0.72], [-1.7, 0.25, 0.72], hex(0x121212));
  // glazing laid just outside the cabin skin: station pairs give the outline
  k.use('glass');
  const gl = hex(0x1a2226);
  const P = (i: number, j: number, off = 0.022): V3 => { const p = rings[i][j]; return [p[0], p[1], p[2] + Math.sign(p[2]) * off]; };
  for (const [a, b] of [[4, 5], [5, 6], [6, 7]]) {
    k.quad(P(a, 11), P(b, 11), P(b, 10), P(a, 10), gl);        // +z side (ring index 11 = shoulder, 10 = glass line)
    k.quad(P(b, 3), P(a, 3), P(a, 4), P(b, 4), gl);            // -z side
  }
  const lift = (p: V3, d: number): V3 => [p[0] + d, p[1] + 0.03, p[2]];
  k.quad(lift(rings[8][3], 0.03), lift(rings[8][11], 0.03), lift(rings[7][10], 0.03), lift(rings[7][4], 0.03), gl); // windscreen
  k.quad(lift(rings[3][11], -0.03), lift(rings[3][3], -0.03), lift(rings[4][4], -0.03), lift(rings[4][10], -0.03), gl); // rear window
  // wheels with hub caps, lamps, plate, bumpers
  for (const x of [-1.2, 1.18]) for (const s of [1, -1]) k.at({ x, y: 0.29, z: s * 0.71, rx: Math.PI / 2 }, () => {
    k.use('concrete'); k.cyl(0, 0, -0.11, 0.11, 0.29, 0.29, 18, hex(0x151515), true);
    k.use('gold'); k.cyl(0, 0, s > 0 ? 0.11 : -0.115, s > 0 ? 0.115 : -0.11, 0.17, 0.16, 12, hex(0xa9abad), true);
  });
  k.use('glow');
  for (const s of [1, -1]) { k.box(1.83, 1.87, 0.5, 0.6, s * 0.46 - 0.13, s * 0.46 + 0.13, hex(0xe8e6d8, 0.5), 'x-'); k.box(-1.86, -1.82, 0.6, 0.74, s * 0.5 - 0.1, s * 0.5 + 0.1, hex(0x8c1410, 0.6), 'x+'); }
  k.use('paint');
  k.box(-1.875, -1.85, 0.44, 0.54, -0.24, 0.24, hex(0xf2f2ee), 'x+');
  k.box(-1.88, -1.7, 0.3, 0.42, -0.7, 0.7, hex(0x2a2a2a), 'x+'); k.box(1.72, 1.9, 0.3, 0.42, -0.68, 0.68, hex(0x2a2a2a), 'x-');
}

/** Hawker pushcart with an umbrella (the mapped "Banana Fritter - pushcart in front of temple"). */
export function pushcart(k: Kit): void {
  k.use('shutter');
  k.use('gold');
  k.box(-0.7, 0.7, 0.4, 0.95, -0.4, 0.4, hex(0xb9bcc0), '', 0.8);
  k.use('glass');
  k.box(-0.66, 0.2, 0.95, 1.35, -0.36, 0.36, hex(0xbfd6dc, 0.6), 'y-');
  k.use('paint');
  k.lathe(0.45, 0, [[0.2, 0.95], [0.26, 1.08], [0.24, 1.1]], 10, hex(0x2a2a2a));
  for (const s of [1, -1]) k.at({ x: -0.25, y: 0.2, z: s * 0.44, rx: Math.PI / 2 }, () => k.cyl(0, 0, -0.025, 0.025, 0.2, 0.2, 14, hex(0x1c1c1c), true));
  k.cyl(0.6, 0, 0, 0.45, 0.025, 0.025, 5, hex(0x777777), false);
  k.cyl(0, 0.45, 0.95, 2.35, 0.02, 0.02, 5, hex(0xcfcfcf), false);
  k.use('fabric');
  const cols = [hex(0xc8281e), hex(0xf1ede0)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2;
    k.poly([[0, 2.42, 0.45], [Math.cos(b) * 1.15, 2.08, 0.45 + Math.sin(b) * 1.15], [Math.cos(a) * 1.15, 2.08, 0.45 + Math.sin(a) * 1.15]], cols[i % 2]);
  }
}

/** Festive lantern strings across the street between the two rows (world frame). */
export function streetLanterns(k: Kit, h: HeightFn, at: number[]): void {
  for (const t of at) {
    // point on the centre line at parameter t (0..1 along the section) and the street normal there
    const total = STREET.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - STREET[i][0], p[1] - STREET[i][1]), 0);
    let d = t * total, i = 1;
    while (i < STREET.length - 1 && d > Math.hypot(STREET[i][0] - STREET[i - 1][0], STREET[i][1] - STREET[i - 1][1])) { d -= Math.hypot(STREET[i][0] - STREET[i - 1][0], STREET[i][1] - STREET[i - 1][1]); i++; }
    const [ax, az] = STREET[i - 1], [bx, bz] = STREET[i], l = Math.hypot(bx - ax, bz - az);
    const px = ax + ((bx - ax) * d) / l, pz = az + ((bz - az) * d) / l, nx = -(bz - az) / l, nz = (bx - ax) / l, y = h(px, pz) + 6.1;
    lanternString(k, [px - nx * 4.2, y, pz - nz * 4.2], [px + nx * 4.2, y, pz + nz * 4.2], 9, 0.17, 0.35);
  }
}
