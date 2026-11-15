// Hiang Thian Siang Ti Temple (玄天上帝庙), Carpenter Street, Kuching.
//
// Reconstructed from the references listed in src/world/landmarks/registry.ts. Plan, front to back
// (aerial imagery): open granite forecourt, three-bay front hall, central pavilion, large rear hall.
// Facade (photographs): low single-storey front, three doors, tiger and dragon wall panels between
// them, red columns, pink end walls, green glazed roofs in three sections with the centre section
// raised and all ridges swept up into swallow tails, coloured cut-ceramic ridge ornament.
//
// All dimensions in metres. Measured: site width and depth, roof plan (see registry). Estimated:
// every height, the bay widths, all ornament.
import { MeshBuilder, hex, mix, shade } from '../kit/mesh.ts';
import type { Col, V3 } from '../kit/mesh.ts';
import { sag, roofQuad, roofRibs, eaveTrim, ridgeBeam, swallowTail, ridgeDragon, ridgePearl, hipRoof, lanternString } from '../kit/chinese.ts';
import type { Field } from '../kit/chinese.ts';
import { panelZ, panelY, paving, rectRing, squareRing } from '../kit/model.ts';
import type { ModelOutput, Plaque } from '../kit/model.ts';

// ---- plan ----
const HW = 5.2;            // half site width
const XW = 4.85;           // inner face of the pink side walls = roof edge
const D = 29.4;            // site depth
const Z_PLAT = -5.2;       // front edge of the raised temple floor
const Z_EAVE = -5.3, Z_WALL = -6.6, Z_RIDGE = -8.3, Z_BACK = -11.3;   // front hall
const XC = 2.15;           // half width of the raised centre roof section
const PAV = { cx: 0, cz: -14.5, hx: 3.1, hz: 3.0, yEave: 4.35, rise: 1.6, ridgeHalf: 0.9, lift: 0.42 };
const R_EAVE_F = -17.7, R_RIDGE = -23.6, R_EAVE_B = -D + 0.05;       // rear hall
// ---- heights ----
const Y_PAVE = 0.06, Y_PLAT = 0.18;
const E_SIDE = 3.45, E_CENTRE = 4.15, RISE = 1.5;
const R_EAVE_Y = 4.5, R_RISE = 2.9;

const TILE = { base: hex(0x1f7d58), rib: hex(0x33a274), trim: hex(0x176347) };
const PINK = hex(0xe7a8a0), CREAM = hex(0xeadfc6), RED = hex(0xc4291f), RED_DARK = hex(0x8c1f19), GOLD = hex(0xdcb043);
const BLACK = hex(0x18120f), STONE = hex(0x8d8c86), GRANITE = hex(0x9c988d), TIMBER = hex(0x6e231c);

const tFront = (z: number) => Math.max(0, Math.min(1, z >= Z_RIDGE ? (Z_EAVE - z) / (Z_EAVE - Z_RIDGE) : (z - Z_BACK) / (Z_RIDGE - Z_BACK)));
const centreField: Field = (x, z) => { const t = tFront(z), e = Math.pow(Math.min(1, Math.abs(x) / XC), 2.6); return E_CENTRE + RISE * sag(t) + e * (0.42 * t + 0.16 * (1 - t)); };
const sideField: Field = (x, z) => { const t = tFront(z), e = Math.pow(Math.max(0, Math.min(1, (Math.abs(x) - XC) / (XW - XC))), 2.4); return E_SIDE + RISE * sag(t) + e * (0.5 * t + 0.2 * (1 - t)); };
const rearField: Field = (x, z) => {
  const t = Math.max(0, Math.min(1, z >= R_RIDGE ? (R_EAVE_F - z) / (R_EAVE_F - R_RIDGE) : (z - R_EAVE_B) / (R_RIDGE - R_EAVE_B)));
  const e = Math.pow(Math.min(1, Math.abs(x) / XW), 3);
  return R_EAVE_Y + R_RISE * sag(t) + e * (0.45 * t + 0.15 * (1 - t));
};

function ribLines(x0: number, x1: number, zA: number, zB: number, pitch = 0.29): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const n = Math.max(1, Math.round((x1 - x0) / pitch));
  for (let i = 0; i < n; i++) { const x = x0 + ((i + 0.5) * (x1 - x0)) / n; out.push([x, zA, x, zB]); }
  return out;
}

function frontHallRoof(b: MeshBuilder): void {
  const nu = b.detail ? 8 : 3, nv = b.detail ? 4 : 2;
  // centre section (raised)
  roofQuad(b, centreField, [-XC, Z_EAVE], [XC, Z_EAVE], [XC, Z_RIDGE], [-XC, Z_RIDGE], nu, nv, TILE.base);
  roofQuad(b, centreField, [-XC, Z_BACK], [XC, Z_BACK], [XC, Z_RIDGE], [-XC, Z_RIDGE], nu, nv, shade(TILE.base, 0.92));
  roofRibs(b, centreField, [...ribLines(-XC + 0.1, XC - 0.1, Z_EAVE, Z_RIDGE), ...ribLines(-XC + 0.1, XC - 0.1, Z_BACK, Z_RIDGE)], 4, TILE.rib);
  eaveTrim(b, centreField, [-XC, Z_EAVE], [XC, Z_EAVE], [0, 0, 1], nu, 0.13, TILE.trim);
  // soffit of the overhang
  const soffit = (f: Field, x0: number, x1: number) => {
    const a: V3[] = [], c: V3[] = [];
    for (let i = 0; i <= nu; i++) { const x = x0 + ((x1 - x0) * i) / nu; a.push([x, f(x, Z_EAVE) - 0.05, Z_EAVE]); c.push([x, f(x, Z_WALL) - 0.05, Z_WALL]); }
    b.grid([a, c], TIMBER, { dir: [0, -1, 0] }, false);
  };
  soffit(centreField, -XC, XC);
  // centre ridge with swallow tails, twin dragons and the pearl
  const rp: V3[] = [];
  const rn = b.detail ? 8 : 2;
  for (let i = 0; i <= rn; i++) { const x = -XC + (2 * XC * i) / rn; rp.push([x, centreField(x, Z_RIDGE) - 0.03, Z_RIDGE]); }
  ridgeBeam(b, rp, 0.52, 0.24, TILE.trim, 11);
  for (const s of [1, -1]) swallowTail(b, [s * XC, rp[0][1] + 0.2, Z_RIDGE], s, 0, 1.0, 1.05, 0.2, 0.34, TILE.trim);
  const ry = centreField(0, Z_RIDGE) + 0.5;
  ridgePearl(b, 0, ry, Z_RIDGE, 1.05);
  ridgeDragon(b, -0.32, ry, Z_RIDGE, 1, 1.45);
  ridgeDragon(b, 0.32, ry, Z_RIDGE, -1, 1.45);

  b.mirrored(() => {
    // side section
    roofQuad(b, sideField, [XC, Z_EAVE], [XW, Z_EAVE], [XW, Z_RIDGE], [XC, Z_RIDGE], nu, nv, TILE.base);
    roofQuad(b, sideField, [XC, Z_BACK], [XW, Z_BACK], [XW, Z_RIDGE], [XC, Z_RIDGE], nu, nv, shade(TILE.base, 0.92));
    roofRibs(b, sideField, [...ribLines(XC + 0.12, XW - 0.1, Z_EAVE, Z_RIDGE), ...ribLines(XC + 0.12, XW - 0.1, Z_BACK, Z_RIDGE)], 4, TILE.rib);
    eaveTrim(b, sideField, [XC, Z_EAVE], [XW, Z_EAVE], [0, 0, 1], nu, 0.13, TILE.trim);
    soffit(sideField, XC, XW);
    // step between the side roof and the raised centre roof
    const lo: V3[] = [], hi: V3[] = [];
    const k = b.detail ? 8 : 4;
    for (let i = 0; i <= k; i++) { const z = Z_EAVE + ((Z_BACK - Z_EAVE) * i) / k; lo.push([XC, sideField(XC, z) - 0.02, z]); hi.push([XC, centreField(XC, z) + 0.01, z]); }
    b.grid([lo, hi], (i) => (b.detail && i % 2 ? hex(0x2e62b8) : hex(0xe9e4d4)), { dir: [1, 0, 0] }, false);
    panelZ(b, XC - 0.02, XC + 0.02, sideField(XC, Z_EAVE) - 0.15, centreField(XC, Z_EAVE), Z_EAVE, hex(0xe9e4d4));
    // roll along the edge of the centre section, ending in an upturned tip with a figure
    const roll = (x: number, f: Field, tip: number) => {
      const path: V3[] = [];
      const m = b.detail ? 5 : 2;
      for (let i = 0; i <= m; i++) { const z = Z_RIDGE + ((Z_EAVE + 0.05 - Z_RIDGE) * i) / m; path.push([x, f(x, z) + 0.01, z]); }
      b.sweep(path, () => [[-0.1, 0], [0.1, 0], [0.08, 0.24], [-0.08, 0.24]], (e) => (e === 2 ? TILE.trim : hex(0xe9e4d4)));
      swallowTail(b, [x, path[m][1] + 0.05, Z_EAVE + 0.05], 0, 1, tip, tip * 0.9, 0.16, 0.2, TILE.trim);
      if (b.detail) { b.sphere(x, path[m][1] + 0.42, Z_EAVE - 0.25, 0.1, 5, 3, hex(0xe2b93a), 1.6); b.sphere(x, path[m][1] + 0.5, Z_EAVE - 0.7, 0.09, 5, 3, hex(0x2e62b8), 1.6); }
    };
    roll(XC - 0.1, centreField, 0.5);
    roll(XW - 0.12, sideField, 0.4);
    // side ridge, swept up toward the outer end
    const sp: V3[] = [];
    const sn = b.detail ? 6 : 2, xe = XW - 0.62;
    for (let i = 0; i <= sn; i++) { const x = XC + 0.02 + ((xe - XC) * i) / sn; sp.push([x, sideField(x, Z_RIDGE) - 0.03, Z_RIDGE]); }
    ridgeBeam(b, sp, 0.44, 0.22, TILE.trim, 23);
    swallowTail(b, [xe, sp[sn][1] + 0.16, Z_RIDGE], 1, 0, 0.5, 0.95, 0.18, 0.3, TILE.trim);
  });
}

function mural(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z: number, dragon: boolean): void {
  // frame, then a painted panel. The real panels are painted reliefs; these are flat colour
  // compositions in the same palette (approximation, nothing is copied from the photographs).
  panelZ(b, x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.1, z, GOLD);
  panelZ(b, x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, z + 0.006, hex(0x1f4f6e));
  const top = hex(0x56a9bd), bot = hex(0x235f86);
  panelZ(b, x0, x1, y0, y1, z + 0.012, [bot, bot, top, top]);
  if (!b.detail) return;
  const w = x1 - x0, h = y1 - y0, zz = z + 0.02;
  const P = (u: number, v: number): V3 => [x0 + u * w, y0 + v * h, zz];
  const blob = (u: number, v: number, ru: number, rv: number, c: Col, n = 9) => { const pts: V3[] = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(P(u + Math.cos(a) * ru, v + Math.sin(a) * rv)); } b.flat(pts, c, [0, 0, 1]); };
  // ground / rocks and clouds
  b.flat([P(0, 0), P(1, 0), P(1, 0.16), P(0.6, 0.24), P(0.3, 0.14), P(0, 0.22)], hex(0x4c7a4a), [0, 0, 1]);
  blob(0.2, 0.86, 0.16, 0.06, hex(0xf0ece0)); blob(0.72, 0.9, 0.2, 0.05, hex(0xf0ece0));
  if (dragon) {
    const a: V3[] = [], c: V3[] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, u = 0.18 + 0.64 * t + Math.sin(t * Math.PI * 2.4) * 0.06, v = 0.26 + 0.5 * t + Math.sin(t * Math.PI * 3) * 0.1, wd = 0.045 + 0.04 * Math.sin(t * Math.PI); a.push(P(u - wd, v + wd * 0.6)); c.push(P(u + wd, v - wd * 0.6)); }
    b.grid([a, c], (i) => (i % 2 ? hex(0x2f9a63) : hex(0x58c07c)), { dir: [0, 0, 1] }, false);
    blob(0.84, 0.8, 0.07, 0.045, GOLD); blob(0.5, 0.82, 0.045, 0.03, hex(0xd23a2c));
  } else {
    blob(0.5, 0.42, 0.26, 0.13, hex(0xe08a2a), 10); blob(0.74, 0.56, 0.11, 0.075, hex(0xe9992f));
    for (const u of [0.36, 0.46, 0.56]) b.flat([P(u, 0.32), P(u + 0.03, 0.32), P(u + 0.05, 0.53), P(u + 0.02, 0.53)], hex(0x2a1c12), [0, 0, 1]);
    for (const u of [0.34, 0.6]) b.flat([P(u, 0.18), P(u + 0.06, 0.18), P(u + 0.07, 0.34), P(u, 0.34)], hex(0xd67f25), [0, 0, 1]);
    blob(0.2, 0.7, 0.14, 0.1, hex(0x2f7a45));
  }
}

function facade(b: MeshBuilder, plaques: Plaque[]): void {
  const z = Z_WALL;
  // wall up to the roof (top follows the roof underside)
  const wall = (f: Field, x0: number, x1: number, c: Col) => {
    const lo: V3[] = [], hi: V3[] = [];
    const n = b.detail ? 6 : 2;
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; lo.push([x, Y_PLAT, z]); hi.push([x, f(x, z) - 0.03, z]); }
    b.grid([lo, hi], c, { dir: [0, 0, 1] }, false);
  };
  wall(centreField, -XC, XC, CREAM);
  // centre bay: door, plaque, beam
  panelZ(b, -1.05, 1.05, Y_PLAT, 2.75, z + 0.02, RED);
  panelZ(b, -0.92, 0.92, Y_PLAT, 2.62, z + 0.035, BLACK);
  if (b.detail) {
    // a glimpse of the altar inside
    panelZ(b, -0.6, 0.6, Y_PLAT, 1.1, z + 0.045, hex(0x9c1c16));
    panelZ(b, -0.55, 0.55, 1.0, 1.1, z + 0.05, GOLD);
    b.flat([[-0.22, 1.1, z + 0.05], [0.22, 1.1, z + 0.05], [0.16, 1.75, z + 0.05], [0, 1.95, z + 0.05], [-0.16, 1.75, z + 0.05]], hex(0xc79a2e), [0, 0, 1]);
    for (const x of [-0.42, 0.42]) panelZ(b, x - 0.04, x + 0.04, 1.1, 1.5, z + 0.05, hex(0xf0b040));
  }
  b.box(-XC + 0.25, XC - 0.25, 3.55, 3.98, z, z + 0.3, RED_DARK, ['z-']);
  panelZ(b, -XC + 0.25, XC - 0.25, 3.72, 3.8, z + 0.305, GOLD);
  b.box(-0.9, 0.9, 2.86, 3.46, z, z + 0.12, BLACK, ['z-']);
  panelZ(b, -0.9, 0.9, 2.86, 2.9, z + 0.125, GOLD); panelZ(b, -0.9, 0.9, 3.42, 3.46, z + 0.125, GOLD);
  plaques.push({ text: '廟帝上', x: 0, y: 3.16, z: z + 0.13, w: 1.55, h: 0.46, ry: 0, fg: '#e9c35a', bg: '#18120f', basis: 'approximation: the temple is commonly called 上帝廟 (read right to left); the wording of the real board was not legible in the references' });

  b.mirrored((side) => {
    wall(sideField, XC, XW, CREAM);
    // red pillar with a couplet board
    b.box(1.52, 1.9, Y_PLAT, 4.1, z, z + 0.4, RED, ['z-']);
    panelZ(b, 1.6, 1.82, 0.95, 3.0, z + 0.405, BLACK);
    if (b.detail) for (let i = 0; i < 6; i++) panelZ(b, 1.66, 1.76, 1.08 + i * 0.31, 1.26 + i * 0.31, z + 0.41, GOLD);
    panelZ(b, 1.05, 1.52, Y_PLAT, 3.55, z + 0.015, hex(0xd9cdb0));
    // carved stone dado and the wall panel (tiger on the left, dragon on the right)
    panelZ(b, 1.9, 3.5, Y_PLAT, 0.92, z + 0.02, [shade(STONE, 0.8), shade(STONE, 0.8), STONE, STONE]);
    if (b.detail) for (let i = 0; i < 3; i++) panelZ(b, 2.0 + i * 0.5, 2.4 + i * 0.5, 0.32, 0.8, z + 0.03, shade(STONE, 1.15));
    mural(b, 2.05, 3.35, 1.12, 2.78, z + 0.02, side > 0);
    // side door
    panelZ(b, 3.58, 4.74, Y_PLAT, 2.6, z + 0.02, RED);
    panelZ(b, 3.7, 4.62, Y_PLAT, 2.48, z + 0.035, BLACK);
    if (b.detail) { panelZ(b, 3.7, 4.62, Y_PLAT, 0.3, z + 0.045, hex(0x5a1612)); panelZ(b, 3.86, 4.46, 2.7, 2.98, z + 0.03, BLACK); panelZ(b, 3.95, 4.37, 2.78, 2.9, z + 0.036, GOLD); }
    // beam under the eave
    b.box(1.9, XW, 3.02, 3.3, z, z + 0.16, RED_DARK, ['z-']);
    panelZ(b, 1.9, XW, 3.13, 3.19, z + 0.165, GOLD);
  });
}

function lion(b: MeshBuilder, x: number, z: number): void {
  b.push({ x, z });
  b.box(-0.4, 0.4, Y_PAVE, 0.22, -0.4, 0.4, shade(STONE, 0.9));
  b.box(-0.32, 0.32, 0.22, 1.16, -0.32, 0.32, STONE);
  b.box(-0.39, 0.39, 1.16, 1.3, -0.39, 0.39, shade(STONE, 1.08));
  if (b.detail) {
    for (const s of [1, -1]) { panelZ(b, -0.22, 0.22, 0.38, 1.0, s * 0.325, shade(STONE, 0.78), s); }
    const c = shade(STONE, 1.05);
    b.sphere(0, 1.56, -0.12, 0.27, 7, 4, c, 0.95);          // haunches
    b.sphere(0, 1.68, 0.1, 0.21, 7, 4, c, 1.3);             // chest
    b.sphere(0, 2.0, 0.1, 0.24, 7, 4, shade(STONE, 0.86), 0.95); // mane
    b.sphere(0, 2.02, 0.2, 0.18, 7, 4, c);                  // head
    b.box(-0.09, 0.09, 1.9, 2.0, 0.32, 0.43, c, []);        // muzzle
    for (const s of [1, -1]) b.box(s * 0.12 - 0.05, s * 0.12 + 0.05, 1.3, 1.62, 0.14, 0.27, c);
    b.lathe(0, 0.1, [[0.2, 1.8], [0.23, 1.84], [0.2, 1.88]], 7, hex(0xc8281e)); // ribbon
  } else b.box(-0.2, 0.2, 1.3, 2.1, -0.3, 0.3, STONE, []);
  b.pop();
}

function censer(b: MeshBuilder): void {
  const z = -3.4;
  b.push({ z });
  const gold = hex(0xc9a23a), red = hex(0xd2362c);
  b.lathe(0, 0, [[0.52, Y_PAVE], [0.52, 0.16], [0.36, 0.22]], 9, shade(gold, 0.8));
  if (b.detail) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; b.lathe(Math.cos(a) * 0.3, Math.sin(a) * 0.3, [[0.07, 0.2], [0.09, 0.45], [0.06, 0.62]], 5, gold); }
  b.lathe(0, 0, [[0.12, 0.56], [0.4, 0.68], [0.54, 0.92], [0.5, 1.12], [0.58, 1.2], [0.58, 1.27], [0.44, 1.27], [0.4, 1.16]], 10, (_i, j) => (j === 4 || j === 5 ? shade(gold, 1.15) : gold));
  if (b.detail) for (const s of [1, -1]) b.tube([[s * 0.5, 1.0, 0], [s * 0.74, 1.12, 0], [s * 0.78, 1.36, 0], [s * 0.62, 1.5, 0]], 0.045, 5, gold);
  // canopy on four posts with a two-tier roof
  for (const sx of [1, -1]) for (const sz of [1, -1]) b.box(sx * 0.62 - 0.03, sx * 0.62 + 0.03, Y_PAVE, 2.5, sz * 0.62 - 0.03, sz * 0.62 + 0.03, red);
  const tier = (half: number, y0: number, top: number, y1: number) => {
    const q = (sx: number, sz: number, hh: number, y: number): V3 => [sx * hh, y, sz * hh];
    b.flat([q(-1, 1, half, y0), q(1, 1, half, y0), q(1, 1, top, y1), q(-1, 1, top, y1)], red, [0, 0.5, 1]);
    b.flat([q(-1, -1, half, y0), q(1, -1, half, y0), q(1, -1, top, y1), q(-1, -1, top, y1)], shade(red, 0.9), [0, 0.5, -1]);
    b.flat([q(1, -1, half, y0), q(1, 1, half, y0), q(1, 1, top, y1), q(1, -1, top, y1)], shade(red, 0.82), [1, 0.5, 0]);
    b.flat([q(-1, -1, half, y0), q(-1, 1, half, y0), q(-1, 1, top, y1), q(-1, -1, top, y1)], shade(red, 0.82), [-1, 0.5, 0]);
    panelY(b, -half, half, -half, half, y0, shade(red, 0.6), -1);
  };
  tier(1.0, 2.45, 0.36, 2.86);
  b.box(-0.3, 0.3, 2.86, 3.05, -0.3, 0.3, shade(red, 0.8));
  tier(0.66, 3.05, 0.02, 3.5);
  b.lathe(0, 0, [[0.05, 3.46], [0.09, 3.56], [0.03, 3.66], [0.06, 3.74], [0.004, 3.9]], 5, gold);
  b.pop();
}

function plant(b: MeshBuilder, x: number, z: number, s: number, flowers: boolean): void {
  b.lathe(x, z, [[0.2 * s, Y_PAVE], [0.3 * s, 0.46 * s], [0.26 * s, 0.5 * s]], 7, hex(0x7a4a34));
  if (!b.detail) { b.sphere(x, 1.0 * s, z, 0.5 * s, 5, 3, hex(0x2f6e3a)); return; }
  for (const [dx, dy, dz, r] of [[0, 0.95, 0, 0.42], [0.25, 1.25, 0.1, 0.33], [-0.22, 1.2, -0.12, 0.3], [0.05, 1.55, -0.05, 0.26]] as number[][]) b.sphere(x + dx * s, dy * s, z + dz * s, r * s, 6, 3, (i, j) => (flowers && (i + j) % 3 === 0 ? hex(0xd0457e) : hex(0x2f6e3a, 0.9 + 0.1 * (j % 2))));
}

export function build(lod: 0 | 1): ModelOutput {
  const b = new MeshBuilder(lod);
  const plaques: Plaque[] = [];

  // --- ground: skirt, granite forecourt, red kerb, raised temple floor ---
  b.box(-HW, HW, -0.6, Y_PAVE, -D, 0, shade(GRANITE, 0.7), ['y-', 'y+']);
  paving(b, -HW, HW, 0, Z_PLAT, Y_PAVE, 0.8, GRANITE, shade(GRANITE, 0.9));
  panelY(b, -HW, HW, Z_PLAT, -D, Y_PAVE, shade(GRANITE, 0.8));
  b.box(-HW, HW, 0, 0.13, -0.22, 0, hex(0xb5322a), ['y-']);
  b.box(-XW, XW, Y_PAVE, Y_PLAT, Z_WALL, Z_PLAT, hex(0xa82f25), ['y-', 'z-']);

  // --- pink side walls (the front part reads as the end pilasters of the facade) and rear wall ---
  b.mirrored(() => {
    b.box(XW, HW, -0.4, 4.95, -D, Z_EAVE + 0.02, PINK, ['y-'], shade(PINK, 0.9));
    // gable infill under the rear hall roof
    const lo: V3[] = [], hi: V3[] = [];
    for (let i = 0; i <= 6; i++) { const z = R_EAVE_F + ((R_EAVE_B - R_EAVE_F) * i) / 6; lo.push([XW + 0.17, 4.9, z]); hi.push([XW + 0.17, Math.max(4.9, rearField(XW, z) - 0.02), z]); }
    b.grid([lo, hi], PINK, { dir: [1, 0, 0] }, false);
  });
  b.box(-XW, XW, -0.4, 4.6, -D, -D + 0.3, PINK, ['y-']);

  // --- front hall ---
  facade(b, plaques);
  frontHallRoof(b);
  // rear wall of the front hall, open to the pavilion court
  b.box(-XW, XW, Y_PLAT, 3.5, Z_BACK + 0.1, Z_BACK + 0.35, CREAM, ['y-']);

  // --- central pavilion between the two side corridors ---
  hipRoof(b, PAV, TILE, { pitch: 0.3, ridgeH: 0.34, tails: 0.22, seed: 5, pearl: true });
  for (const sx of [1, -1]) for (const sz of [1, -1]) b.lathe(PAV.cx + sx * 2.5, PAV.cz + sz * 2.4, [[0.17, Y_PLAT], [0.15, PAV.yEave + 0.1]], b.detail ? 7 : 4, RED);
  b.box(-2.75, 2.75, PAV.yEave - 0.32, PAV.yEave + 0.05, PAV.cz - 2.65, PAV.cz + 2.65, RED_DARK, []);
  b.mirrored(() => {
    const cf: Field = (x) => 3.55 + ((Math.abs(x) - PAV.hx) / (XW - PAV.hx)) * 0.45;
    roofQuad(b, cf, [PAV.hx + 0.25, Z_BACK - 0.1], [PAV.hx + 0.25, R_EAVE_F + 0.1], [XW, R_EAVE_F + 0.1], [XW, Z_BACK - 0.1], 2, 2, shade(TILE.base, 0.88));
    if (b.detail) { const lines: [number, number, number, number][] = []; for (let z = Z_BACK - 0.3; z > R_EAVE_F + 0.2; z -= 0.3) lines.push([PAV.hx + 0.25, z, XW, z]); roofRibs(b, cf, lines, 1, TILE.rib); }
  });

  // --- rear hall ---
  const nu = b.detail ? 8 : 3, nv = b.detail ? 5 : 2;
  roofQuad(b, rearField, [-XW, R_EAVE_F], [XW, R_EAVE_F], [XW, R_RIDGE], [-XW, R_RIDGE], nu, nv, TILE.base);
  roofQuad(b, rearField, [-XW, R_EAVE_B], [XW, R_EAVE_B], [XW, R_RIDGE], [-XW, R_RIDGE], nu, nv, shade(TILE.base, 0.92));
  roofRibs(b, rearField, [...ribLines(-XW + 0.1, XW - 0.1, R_EAVE_F, R_RIDGE, 0.31), ...ribLines(-XW + 0.1, XW - 0.1, R_EAVE_B, R_RIDGE, 0.31)], 5, TILE.rib);
  eaveTrim(b, rearField, [-XW, R_EAVE_F], [XW, R_EAVE_F], [0, 0, 1], nu, 0.14, TILE.trim);
  {
    const rp: V3[] = [];
    const rn = b.detail ? 10 : 2, xe = XW - 1.0;
    for (let i = 0; i <= rn; i++) { const x = -xe + (2 * xe * i) / rn; rp.push([x, rearField(x, R_RIDGE) - 0.03, R_RIDGE]); }
    ridgeBeam(b, rp, 0.6, 0.26, TILE.trim, 31);
    for (const s of [1, -1]) swallowTail(b, [s * xe, rp[0][1] + 0.22, R_RIDGE], s, 0, 0.85, 1.1, 0.22, 0.38, TILE.trim);
    ridgePearl(b, 0, rearField(0, R_RIDGE) + 0.56, R_RIDGE, 1.2);
  }
  b.box(-XW, XW, Y_PLAT, R_EAVE_Y + 0.5, R_EAVE_F - 0.75, R_EAVE_F - 0.45, hex(0xb9392c), ['y-']);
  if (b.detail) for (const x of [-3, 0, 3]) panelZ(b, x - 0.8, x + 0.8, Y_PLAT, 2.7, R_EAVE_F - 0.44, BLACK);

  // --- forecourt furniture ---
  lion(b, -3.05, -2.9);
  lion(b, 3.05, -2.9);
  censer(b);
  if (b.detail) {
    for (const x of [-4.25, -1.55, 1.55, 4.25]) { b.lathe(x, -0.6, [[0.2, Y_PAVE], [0.22, 0.24], [0.14, 0.3]], 7, shade(STONE, 0.9)); b.sphere(x, 0.52, -0.6, 0.27, 8, 5, hex(0xa9a59b)); }
    plant(b, -4.35, -4.55, 1.25, false); plant(b, -4.5, -3.3, 0.8, false);
    plant(b, 4.3, -4.6, 1.2, true); plant(b, 4.45, -3.4, 0.75, true);
  }
  // rows of red lanterns under the eave and across the forecourt
  lanternString(b, [-4.8, 3.2, -5.12], [4.8, 3.2, -5.12], 19, 0.15, 0.1);
  lanternString(b, [-4.8, 3.45, -4.2], [4.8, 3.45, -4.2], 17, 0.15, 0.22);
  lanternString(b, [-5.1, 3.85, -2.6], [5.1, 3.85, -2.6], 16, 0.16, 0.3);
  lanternString(b, [-5.1, 4.1, -1.0], [5.1, 4.1, -1.0], 15, 0.16, 0.34);

  return {
    mesh: b,
    plaques,
    collision: {
      walls: [
        { ring: rectRing(-HW, HW, Z_WALL, -D), top: 7.5 },
        { ring: squareRing(-3.05, -2.9, 0.42), top: 2.2 },
        { ring: squareRing(3.05, -2.9, 0.42), top: 2.2 },
        { ring: squareRing(0, -3.4, 0.7), top: 3.6 },
        { ring: squareRing(-4.4, -4.1, 0.55), top: 2 },
        { ring: squareRing(4.4, -4.1, 0.55), top: 2 },
      ],
      floors: [
        { ring: rectRing(-HW, HW, 0, Z_PLAT), h: Y_PAVE },
        { ring: rectRing(-XW, XW, Z_PLAT, Z_WALL), h: Y_PLAT },
      ],
    },
  };
}
void mix;
