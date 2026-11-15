// Hiang Thian Siang Ti Temple (玄天上帝庙), Carpenter Street, Kuching - V5 reconstruction.
//
// Model frame: origin = middle of the street edge of the forecourt, +Z out into the street, +X to
// the right of a visitor facing the temple, Y up from the forecourt paving.
//
// Evidence used (see docs/V5_REPORT.md for links):
//  - Commons photograph "古晋亚达街玄天上帝庙.jpg" (CC BY-SA 4.0): wide, low, single-storey front
//    hall; green glazed tube-tile roof with the centre bay raised above the two side bays; ridges
//    swept up at the ends and covered in coloured cut-ceramic ornament with two dragons facing a
//    centre finial; salmon-pink plastered walls; three red-framed doorways; a tiger panel left of
//    the centre door and a dragon panel right of it; two red columns carrying the eave; black
//    couplet boards; granite forecourt with two stone lions on tall pedestals, a bronze censer
//    under a red two-tier canopy, stone balls, potted plants; rows of red lanterns with paper tags
//    strung across the forecourt; a small tiled canopy over a gate on the right-hand wall.
//  - Aerial imagery (measured in V4): site 10.4 x 29.4 m; front hall, centre pavilion, rear hall.
// Estimated, not measured: every height, bay widths, ornament, everything behind the front hall.
import { Kit, hex, shade } from '../kit.ts';
import type { V3 } from '../kit.ts';
import { sag, roofPatch, roofRibs, eaveTiles, ridgeBeam, swallowTail, ridgeDragon, ridgePearl, lanternString, column, lion, censer, plant } from './chinese.ts';
import type { Field } from './chinese.ts';
import { atlasUV } from './atlas.ts';

const HW = 5.2, XW = 4.85, D = 29.4;
const Z_PLAT = -5.2, Z_EAVE = -5.3, Z_WALL = -6.6, Z_RIDGE = -8.3, Z_BACK = -11.3;
const XC = 2.15;
const Y_PAVE = 0.06, Y_PLAT = 0.2;
const E_SIDE = 3.5, E_CENTRE = 4.05, RISE = 1.05;
const PAV = { cz: -14.5, hx: 3.1, hz: 3.0, eave: 4.35, rise: 1.5 };
const R_EAVE_F = -17.7, R_RIDGE = -23.6, R_EAVE_B = -D + 0.05, R_EAVE_Y = 4.5, R_RISE = 2.9;

const GREEN = hex(0x0f7046), GREEN_CAP = hex(0x1f9a86), GREEN_D = hex(0x0d4a32), RIB = hex(0x178555);
const PINK = hex(0xe3a79c), RED = hex(0xc4291f), RED_D = hex(0x8c1f19), GOLD = hex(0xdcb043), BLACK = hex(0x15110e), GRANITE = hex(0x9c9a90), CREAM = hex(0xe8dcc4);

const tF = (z: number) => Math.max(0, Math.min(1, z >= Z_RIDGE ? (Z_EAVE - z) / (Z_EAVE - Z_RIDGE) : (z - Z_BACK) / (Z_RIDGE - Z_BACK)));
const centre: Field = (x, z) => { const t = tF(z), e = Math.pow(Math.min(1, Math.abs(x) / XC), 2.6); return E_CENTRE + RISE * sag(t) + e * (0.36 * t + 0.14 * (1 - t)); };
const sideF: Field = (x, z) => { const t = tF(z), e = Math.pow(Math.max(0, Math.min(1, (Math.abs(x) - XC) / (XW - XC))), 2.4); return E_SIDE + RISE * sag(t) + e * (0.3 * t + 0.16 * (1 - t)); };
const rear: Field = (x, z) => {
  const t = Math.max(0, Math.min(1, z >= R_RIDGE ? (R_EAVE_F - z) / (R_EAVE_F - R_RIDGE) : (z - R_EAVE_B) / (R_RIDGE - R_EAVE_B)));
  return R_EAVE_Y + R_RISE * sag(t) + Math.pow(Math.min(1, Math.abs(x) / XW), 3) * (0.42 * t + 0.14 * (1 - t));
};

function ridgePath(f: Field, x0: number, x1: number, z: number, n: number): V3[] {
  const p: V3[] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; p.push([x, f(x, z) - 0.04, z]); }
  return p;
}

/** Row of small cut-ceramic figures, flowers and birds standing on a ridge (stylised, colours as photographed). */
function figures(k: Kit, f: Field, x0: number, x1: number, n: number, seed: number): void {
  if (!k.detail) return;
  const cols = [0xd8402f, 0xe7c24a, 0x2f6fae, 0xf1ede0, 0xe58fb0, 0x3fae74, 0x7b4fa8];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n, y = f(x, Z_RIDGE) + 0.44, c = hex(cols[(i * 3 + seed) % cols.length]);
    k.use('paint');
    if (i % 3 === 0) { // flower
      for (let q = 0; q < 5; q++) { const a = (q / 5) * Math.PI * 2; k.sphere(x + Math.cos(a) * 0.07, y + 0.16 + Math.sin(a) * 0.07, Z_RIDGE, 0.05, 5, 3, c); }
      k.sphere(x, y + 0.16, Z_RIDGE + 0.02, 0.04, 5, 3, hex(0xe7c24a));
      k.cyl(x, Z_RIDGE, y, y + 0.1, 0.015, 0.015, 4, hex(0x2f8a4f), false);
    } else if (i % 3 === 1) { // standing figure
      k.lathe(x, Z_RIDGE, [[0.07, y], [0.085, y + 0.12], [0.05, y + 0.22], [0.03, y + 0.26]], 6, c);
      k.sphere(x, y + 0.31, Z_RIDGE, 0.045, 6, 4, hex(0xe9c9a4));
    } else { // bird / leaf scroll
      k.sphere(x, y + 0.12, Z_RIDGE, 0.08, 6, 4, c, 0.7);
      k.cyl(x + 0.06, Z_RIDGE, y + 0.12, y + 0.3, 0.03, 0, 4, hex(cols[(i + seed + 2) % cols.length]), false);
    }
  }
}

function frontHallRoof(k: Kit): void {
  const nu = k.detail ? 10 : 3, nv = k.detail ? 6 : 2;
  const soffit = (f: Field, x0: number, x1: number) => {
    const a: V3[] = [], c: V3[] = [];
    for (let i = 0; i <= 6; i++) { const x = x1 - ((x1 - x0) * i) / 6; a.push([x, f(x, Z_EAVE) - 0.17, Z_EAVE]); c.push([x, f(x, Z_WALL) - 0.17, Z_WALL]); }
    k.use('timber'); k.grid([a, c], hex(0x6e231c, 0.6));
  };
  // raised centre bay
  k.use('glazed');
  roofPatch(k, centre, -XC, XC, Z_EAVE, Z_RIDGE, nu, nv, GREEN);
  roofPatch(k, centre, -XC, XC, Z_BACK, Z_RIDGE, nu, nv, shade(GREEN, 0.92));
  roofRibs(k, centre, -XC + 0.05, XC - 0.05, Z_EAVE, Z_RIDGE + 0.1, RIB);
  eaveTiles(k, centre, -XC, XC, Z_EAVE, 1, GREEN_CAP, RED_D);
  soffit(centre, -XC, XC);
  const cp = ridgePath(centre, -XC + 0.1, XC - 0.1, Z_RIDGE, k.detail ? 10 : 2);
  ridgeBeam(k, cp, 0.3, 0.5, GREEN_D, atlasUV('ridgeBand'));
  for (const s of [1, -1] as const) swallowTail(k, [s * (XC - 0.1), cp[0][1] + 0.25, Z_RIDGE], s, 1.05, 1.0, 0.26, 0.4, GREEN_D);
  const ry = centre(0, Z_RIDGE) + 0.46;
  ridgePearl(k, 0, ry, Z_RIDGE, 1.25);
  ridgeDragon(k, -0.3, ry, Z_RIDGE, 1, 1.5);
  ridgeDragon(k, 0.3, ry, Z_RIDGE, -1, 1.5);
  figures(k, centre, -XC + 0.3, XC - 0.3, 9, 3);

  k.mirrored(() => {
    k.use('glazed');
    roofPatch(k, sideF, XC, XW, Z_EAVE, Z_RIDGE, nu, nv, GREEN);
    roofPatch(k, sideF, XC, XW, Z_BACK, Z_RIDGE, nu, nv, shade(GREEN, 0.92));
    roofRibs(k, sideF, XC + 0.08, XW - 0.1, Z_EAVE, Z_RIDGE + 0.1, RIB);
    eaveTiles(k, sideF, XC, XW, Z_EAVE, 1, GREEN_CAP, RED_D);
    soffit(sideF, XC, XW);
    // gable step between the side roof and the raised centre roof: white plaster with a painted band
    const lo: V3[] = [], hi: V3[] = [];
    const m = k.detail ? 10 : 4;
    for (let i = 0; i <= m; i++) { const z = Z_BACK + ((Z_EAVE - Z_BACK) * i) / m; lo.push([XC, sideF(XC, z) - 0.03, z]); hi.push([XC, centre(XC, z) + 0.02, z]); }
    k.use('plaster'); k.grid([lo, hi], hex(0xe9e4d4));
    // rolls down the roof edges, ending in upturned tips
    const roll = (x: number, f: Field, tip: number) => {
      const p: V3[] = [];
      const q = k.detail ? 6 : 2;
      for (let i = 0; i <= q; i++) { const z = Z_RIDGE + ((Z_EAVE + 0.05 - Z_RIDGE) * i) / q; p.push([x, f(x, z) + 0.1, z]); }
      k.use('glazed'); k.tube(p, 0.11, 6, GREEN_D);
      const e = p[q];
      k.use('paint');
      k.at({ x: e[0], y: e[1], z: e[2], ry: -Math.PI / 2 }, () => swallowTail(k, [0, 0, 0], 1, tip, tip * 0.8, 0.18, 0.2, GREEN_D));
      if (k.detail) { k.sphere(x, e[1] + 0.3, Z_EAVE - 0.3, 0.09, 6, 4, hex(0xe2b93a)); k.sphere(x, e[1] + 0.34, Z_EAVE - 0.75, 0.08, 6, 4, hex(0x2e62b8)); }
    };
    roll(XC - 0.08, centre, 0.5);
    roll(XW - 0.12, sideF, 0.42);
    // side ridge sweeping up to its outer end
    const xe = XW - 0.6;
    const sp = ridgePath(sideF, XC + 0.02, xe, Z_RIDGE, k.detail ? 6 : 2);
    ridgeBeam(k, sp, 0.26, 0.4, GREEN_D, atlasUV('ridgeBand'));
    swallowTail(k, [xe, sp[sp.length - 1][1] + 0.2, Z_RIDGE], 1, 0.95, 0.95, 0.24, 0.34, GREEN_D);
    figures(k, sideF, XC + 0.25, xe - 0.1, 7, 11);
    ridgeDragon(k, XC + (xe - XC) * 0.62, sideF(XC + (xe - XC) * 0.62, Z_RIDGE) + 0.36, Z_RIDGE, 1, 0.8);
  });
}

function facade(k: Kit): void {
  const z = Z_WALL, T = 0.3;
  // The wall with three real doorways; its top follows the roof underside.
  k.use('plaster');
  k.wall(-XW, XW, Y_PLAT, 3.34, z, T, [
    { x0: -0.98, x1: 0.98, y0: Y_PLAT, y1: 2.78 },
    { x0: 3.42, x1: 4.5, y0: Y_PLAT, y1: 2.5 }, { x0: -4.5, x1: -3.42, y0: Y_PLAT, y1: 2.5 },
  ], PINK, shade(RED, 0.8), 0.8);
  // infill between the wall top and the curved roof underside
  const fill = (f: Field, x0: number, x1: number) => {
    const lo: V3[] = [], hi: V3[] = [];
    for (let i = 0; i <= 6; i++) { const x = x0 + ((x1 - x0) * i) / 6; lo.push([x, 3.34, z]); hi.push([x, f(x, z) - 0.15, z]); }
    k.grid([lo, hi], shade(PINK, 0.8));
  };
  fill(centre, -XC, XC); fill(sideF, XC, XW); fill(sideF, -XW, -XC);
  // dark interior behind the doorways, with a lit altar seen through the centre door
  k.use('plaster');
  const zi = z - T - 3.6;
  k.quad([-XW, Y_PLAT, zi], [XW, Y_PLAT, zi], [XW, 3.6, zi], [-XW, 3.6, zi], hex(0x3a1512, 0.5));
  k.use('paving');
  k.quad([-XW, Y_PLAT + 0.005, z], [XW, Y_PLAT + 0.005, z], [XW, Y_PLAT + 0.005, zi], [-XW, Y_PLAT + 0.005, zi], hex(0x8f4f3c, 0.35));
  k.use('atlas');
  const al = atlasUV('altar');
  k.quad([-1.5, Y_PLAT, zi + 0.4], [1.5, Y_PLAT, zi + 0.4], [1.5, 2.3, zi + 0.4], [-1.5, 2.3, zi + 0.4], [0.9, 0.9, 0.9], al);
  k.use('glow');
  for (const x of [-0.82, 0.82]) k.sphere(x, 0.95, zi + 0.6, 0.06, 5, 4, hex(0xffd27a));

  // red door frames and open door leaves painted with guardians
  const frame = (x0: number, x1: number, y1: number) => {
    k.use('paint');
    k.box(x0 - 0.13, x0, Y_PLAT, y1 + 0.13, z - 0.04, z + 0.05, RED, 'y-');
    k.box(x1, x1 + 0.13, Y_PLAT, y1 + 0.13, z - 0.04, z + 0.05, RED, 'y-');
    k.box(x0, x1, y1, y1 + 0.13, z - 0.04, z + 0.05, RED, 'x+x-');
    k.use('stone');
    k.box(x0 - 0.13, x1 + 0.13, Y_PLAT, Y_PLAT + 0.12, z - T, z + 0.08, hex(0x8a887f), 'y-');
  };
  frame(-0.98, 0.98, 2.78); frame(3.42, 4.5, 2.5); frame(-4.5, -3.42, 2.5);
  if (k.detail) {
    const leaf = (hx: number, dir: 1 | -1, name: 'doorL' | 'doorR') => k.at({ x: hx, z: z - T + 0.04, ry: dir * 1.75 }, () => {
      const a = dir > 0 ? 0 : -0.94, b = dir > 0 ? 0.94 : 0, uv = atlasUV(name);
      k.use('atlas');
      k.quad([a, Y_PLAT + 0.12, 0.03], [b, Y_PLAT + 0.12, 0.03], [b, 2.76, 0.03], [a, 2.76, 0.03], [0.8, 0.8, 0.8], uv);
      k.use('paint');
      k.box(a, b, Y_PLAT + 0.12, 2.76, -0.03, 0.028, RED_D, 'z+');
    });
    leaf(-0.96, 1, 'doorL'); leaf(0.96, -1, 'doorR');
  }
  // name board over the centre door and the painted beam under the eave
  k.use('timber');
  k.box(-1.0, 1.0, 2.98, 3.56, z, z + 0.1, BLACK, 'z-');
  k.use('atlas');
  k.quad([-0.96, 3.0, z + 0.105], [0.96, 3.0, z + 0.105], [0.96, 3.54, z + 0.105], [-0.96, 3.54, z + 0.105], [1, 1, 1], atlasUV('plaqueTemple'));
  const beam = (x0: number, x1: number, y: number) => {
    k.use('paint'); k.box(x0, x1, y, y + 0.34, Z_EAVE - 0.42, Z_EAVE - 0.2, RED_D, '');
    k.use('atlas'); const u = atlasUV('beamBand');
    k.quad([x0, y + 0.06, Z_EAVE - 0.195], [x1, y + 0.06, Z_EAVE - 0.195], [x1, y + 0.28, Z_EAVE - 0.195], [x0, y + 0.28, Z_EAVE - 0.195], [1, 1, 1], [u[0], u[1], u[0] + (u[2] - u[0]) * Math.min(1, (x1 - x0) / 5), u[3]]);
  };
  beam(-XC, XC, E_CENTRE - 0.62);
  k.mirrored((side) => {
    beam(XC, XW, E_SIDE - 0.6);
    // red column on a stone drum, carrying the eave beam
    column(k, 1.45, Z_EAVE - 0.3, Y_PLAT, E_CENTRE - 0.62, 0.15, RED);
    // couplet board beside the centre door
    k.use('timber'); k.box(1.16, 1.4, 0.78, 2.72, z, z + 0.05, BLACK, 'z-');
    k.use('atlas'); k.quad([1.17, 0.8, z + 0.055], [1.39, 0.8, z + 0.055], [1.39, 2.7, z + 0.055], [1.17, 2.7, z + 0.055], [1, 1, 1], atlasUV(side > 0 ? 'coupletR' : 'coupletL'));
    // carved stone dado and the painted relief panel in a moulded frame
    k.use('stone'); k.box(1.72, 3.24, Y_PLAT, 0.96, z, z + 0.07, hex(0x8f8f88), 'z-y-');
    k.use('atlas'); k.quad([1.76, Y_PLAT + 0.06, z + 0.075], [3.2, Y_PLAT + 0.06, z + 0.075], [3.2, 0.9, z + 0.075], [1.76, 0.9, z + 0.075], [1, 1, 1], atlasUV('stoneCarve'));
    k.use('paint');
    for (const [a, b, c, d] of [[1.74, 3.22, 1.02, 1.1], [1.74, 3.22, 2.86, 2.94]]) k.box(a, b, c, d, z, z + 0.08, GOLD, 'z-');
    for (const [a, b] of [[1.74, 1.82], [3.14, 3.22]]) k.box(a, b, 1.1, 2.86, z, z + 0.08, GOLD, 'z-y+y-');
  });
  // panels: tiger on the visitor's left, dragon on the right (not mirrored)
  k.use('atlas');
  k.quad([-3.14, 1.1, z + 0.03], [-1.82, 1.1, z + 0.03], [-1.82, 2.86, z + 0.03], [-3.14, 2.86, z + 0.03], [1, 1, 1], atlasUV('tiger'));
  k.quad([1.82, 1.1, z + 0.03], [3.14, 1.1, z + 0.03], [3.14, 2.86, z + 0.03], [1.82, 2.86, z + 0.03], [1, 1, 1], atlasUV('dragon'));
}

function pavilionAndRear(k: Kit): void {
  // Centre pavilion: hip roof with curved eaves on four red columns (seen from above and through the hall).
  const P = PAV, n = k.detail ? 6 : 2;
  const f: Field = (x, z) => { const t = Math.min(1, Math.max(0, 1 - Math.max(Math.abs(x) / P.hx, Math.abs(z - P.cz) / P.hz))); const c = Math.pow(Math.min(1, Math.abs(x) / P.hx) * Math.min(1, Math.abs(z - P.cz) / P.hz), 2); return P.eave + P.rise * sag(Math.min(1, t * 1.25)) + c * 0.4; };
  k.use('glazed');
  for (const s of [1, -1]) {
    // front/back trapezoids and the two side triangles, each as a small curved grid
    const rowsZ: V3[][] = [], rowsX: V3[][] = [];
    for (let j = 0; j <= n; j++) {
      const t = j / n, rz: V3[] = [], rx: V3[] = [];
      const hw = P.hx * (1 - t * 0.8), hd = P.hz * (1 - t);
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1;
        const x = s * u * hw, z = P.cz + s * hd; rz.push([x, f(x, z), z]);
        const x2 = s * hw, z2 = P.cz - s * u * hd; rx.push([x2, f(x2, z2), z2]);
      }
      rowsZ.push(rz); rowsX.push(rx);
    }
    k.grid(rowsZ, shade(GREEN, s > 0 ? 1 : 0.92));
    k.grid(rowsX, shade(GREEN, 0.96));
  }
  ridgeBeam(k, [[-P.hx * 0.2, P.eave + P.rise - 0.05, P.cz], [P.hx * 0.2, P.eave + P.rise - 0.05, P.cz]], 0.24, 0.3, GREEN_D);
  ridgePearl(k, 0, P.eave + P.rise + 0.2, P.cz, 0.9);
  for (const sx of [1, -1]) for (const sz of [1, -1]) column(k, sx * 2.5, P.cz + sz * 2.4, Y_PLAT, P.eave + 0.05, 0.16, RED);
  // corridor roofs either side of the pavilion
  k.mirrored(() => {
    const cf: Field = (x) => 3.55 + ((Math.abs(x) - P.hx) / (XW - P.hx)) * 0.45;
    k.use('glazed');
    k.quad([P.hx + 0.25, cf(P.hx + 0.25, 0), R_EAVE_F + 0.1], [P.hx + 0.25, cf(P.hx + 0.25, 0), Z_BACK - 0.1], [XW, cf(XW, 0), Z_BACK - 0.1], [XW, cf(XW, 0), R_EAVE_F + 0.1], shade(GREEN, 0.88));
  });
  // courtyard floor
  k.use('stone');
  k.quad([-XW, Y_PLAT, Z_BACK], [XW, Y_PLAT, Z_BACK], [XW, Y_PLAT, R_EAVE_F], [-XW, Y_PLAT, R_EAVE_F], shade(GRANITE, 0.7));
  // rear hall
  const nu = k.detail ? 10 : 3, nv = k.detail ? 6 : 2;
  k.use('glazed');
  roofPatch(k, rear, -XW, XW, R_EAVE_F, R_RIDGE, nu, nv, GREEN);
  roofPatch(k, rear, -XW, XW, R_EAVE_B, R_RIDGE, nu, nv, shade(GREEN, 0.92));
  eaveTiles(k, rear, -XW, XW, R_EAVE_F, 1, GREEN_CAP, RED_D);
  const xe = XW - 1.0, rp = ridgePath(rear, -xe, xe, R_RIDGE, k.detail ? 10 : 2);
  ridgeBeam(k, rp, 0.3, 0.55, GREEN_D, atlasUV('ridgeBand2'));
  for (const s of [1, -1] as const) swallowTail(k, [s * xe, rp[0][1] + 0.25, R_RIDGE], s, 0.9, 1.1, 0.26, 0.42, GREEN_D);
  ridgePearl(k, 0, rear(0, R_RIDGE) + 0.5, R_RIDGE, 1.2);
  k.use('plaster');
  k.wall(-XW, XW, Y_PLAT, R_EAVE_Y + 0.4, R_EAVE_F - 0.5, 0.3, k.detail ? [{ x0: -3.8, x1: -2.2, y0: Y_PLAT, y1: 2.7 }, { x0: -0.8, x1: 0.8, y0: Y_PLAT, y1: 2.7 }, { x0: 2.2, x1: 3.8, y0: Y_PLAT, y1: 2.7 }] : [], hex(0xb9392c), hex(0x3a1512));
  k.quad([-XW, Y_PLAT, R_EAVE_F - 1.2], [XW, Y_PLAT, R_EAVE_F - 1.2], [XW, 3, R_EAVE_F - 1.2], [-XW, 3, R_EAVE_F - 1.2], hex(0x2a100e, 0.6));
  // rear wall of the front hall (toward the courtyard)
  k.at({ z: Z_BACK + 0.1, ry: Math.PI }, () => k.wall(-XW, XW, Y_PLAT, 3.5, 0, 0.25, [], CREAM));
}

function forecourt(k: Kit): void {
  k.use('stone');
  k.box(-HW, HW, -0.5, Y_PAVE, Z_PLAT, 0, GRANITE, 'y-', 0.8);
  // raised temple floor with a red-painted step
  k.use('paving');
  k.box(-XW, XW, Y_PAVE, Y_PLAT, Z_WALL, Z_PLAT, hex(0x9a4a3a), 'y-z-');
  k.use('paint');
  k.box(-XW, XW, Y_PAVE, Y_PLAT + 0.005, Z_PLAT, Z_PLAT + 0.06, hex(0xb5322a), 'y-');
  lion(k, -3.05, -2.9); lion(k, 3.05, -2.9);
  censer(k, 0, -3.4);
  if (k.detail) {
    for (const x of [-4.25, -1.55, 1.55, 4.25]) {
      k.use('stone');
      k.lathe(x, -0.6, [[0.2, Y_PAVE], [0.22, 0.24], [0.14, 0.3]], 9, hex(0x85857e));
      k.sphere(x, 0.54, -0.6, 0.27, 12, 8, hex(0xa9a59b));
    }
    plant(k, -4.35, -4.55, 1.25, false, 1); plant(k, -4.5, -3.3, 0.8, false, 2);
    plant(k, 4.3, -4.6, 1.2, true, 3); plant(k, 4.45, -3.4, 0.75, true, 4);
    // "please remove your shoes" style standing notice left of the centre door
    k.use('paint');
    k.cyl(-1.75, -5.0, Y_PLAT, 1.1, 0.02, 0.02, 5, hex(0x333333), false);
    k.box(-2.0, -1.5, 1.1, 1.55, -5.02, -4.99, hex(0xf2f2ee));
    k.box(-1.98, -1.52, 1.12, 1.3, -4.99, -4.985, hex(0xc8281e), 'z-');
  }
  // small tiled canopy over a grille gate on the right-hand wall (seen at the right of the photograph)
  const cf: Field = (x) => 3.05 - (HW - x) * 0.45;
  k.use('glazed');
  k.quad([HW - 0.95, cf(HW - 0.95, 0), -2.6], [HW - 0.95, cf(HW - 0.95, 0), -4.6], [HW - 0.02, cf(HW, 0), -4.6], [HW - 0.02, cf(HW, 0), -2.6], GREEN);
  k.use('paint');
  k.box(HW - 0.97, HW - 0.93, 2.5, 2.64, -4.6, -2.6, RED_D);
  k.box(HW - 0.07, HW - 0.01, Y_PAVE, 2.35, -4.25, -4.15, RED); k.box(HW - 0.07, HW - 0.01, Y_PAVE, 2.35, -3.05, -2.95, RED); k.box(HW - 0.07, HW - 0.01, 2.25, 2.37, -4.25, -2.95, RED);
  if (k.detail) for (let zz = -4.1; zz < -3.05; zz += 0.11) k.box(HW - 0.05, HW - 0.03, Y_PAVE, 2.25, zz - 0.01, zz + 0.01, hex(0x555a5e), 'y+y-');
  // lantern strings: under the eave and across the forecourt, with paper tags
  const tag = atlasUV('tag');
  lanternString(k, [-4.8, 3.25, -5.1], [4.8, 3.25, -5.1], k.detail ? 18 : 9, 0.16, 0.1, tag);
  lanternString(k, [-5.1, 3.5, -4.3], [5.1, 3.5, -4.3], k.detail ? 17 : 8, 0.17, 0.2, tag);
  lanternString(k, [-5.15, 3.7, -3.4], [5.15, 3.7, -3.4], k.detail ? 16 : 0, 0.17, 0.26, tag);
  lanternString(k, [-5.15, 3.8, -2.5], [5.15, 3.8, -2.5], k.detail ? 16 : 0, 0.17, 0.3, tag);
  lanternString(k, [-5.15, 3.9, -1.6], [5.15, 3.9, -1.6], k.detail ? 15 : 0, 0.17, 0.32, tag);
  lanternString(k, [-5.15, 3.95, -0.7], [5.15, 3.95, -0.7], k.detail ? 15 : 0, 0.17, 0.34, tag);
}

/** Authored reconstruction (Approach B). */
export function buildTemple(k: Kit): void {
  forecourt(k);
  // pink side walls of the temple itself, from the eave line to the back, and the rear wall
  k.mirrored(() => {
    k.use('plaster');
    k.box(XW, HW, -0.4, 4.95, -D, Z_EAVE + 0.02, PINK, 'y-', 0.8);
    const lo: V3[] = [], hi: V3[] = [];
    for (let i = 0; i <= 6; i++) { const z = R_EAVE_B + ((R_EAVE_F - R_EAVE_B) * i) / 6; lo.push([XW + 0.17, 4.9, z]); hi.push([XW + 0.17, Math.max(4.9, rear(XW, z) - 0.02), z]); }
    k.grid([lo, hi], PINK, true);
  });
  k.use('plaster');
  k.at({ z: -D, ry: Math.PI }, () => k.wall(-HW, HW, -0.4, 4.9, 0, 0.3, [], PINK));
  facade(k);
  frontHallRoof(k);
  pavilionAndRear(k);
}

/**
 * Rule-based Chinese temple (Approach A): a generic grammar fitted to the mapped site. It knows the
 * footprint and the building class only - no reference photograph informs it.
 */
export function buildGenericTemple(k: Kit, width: number, depth: number): void {
  const hw = width / 2, xw = hw - 0.3, court = Math.min(6, depth * 0.2), zw = -court - 1.2, zr = zw - 2.2, zb = zr - 3.4, eave = 3.6, rise = 1.6;
  const t = (z: number) => Math.max(0, Math.min(1, z >= zr ? (-court - z) / (-court - zr) : (z - zb) / (zr - zb)));
  const f: Field = (x, z) => eave + rise * sag(t(z)) + Math.pow(Math.min(1, Math.abs(x) / xw), 3) * 0.4;
  k.use('stone'); k.box(-hw, hw, -0.5, 0.06, -court, 0, GRANITE, 'y-');
  k.use('plaster');
  k.wall(-xw, xw, 0.06, eave - 0.1, zw, 0.3, [{ x0: -0.95, x1: 0.95, y0: 0.06, y1: 2.7 }, { x0: xw - 1.6, x1: xw - 0.5, y0: 0.06, y1: 2.4 }, { x0: -xw + 0.5, x1: -xw + 1.6, y0: 0.06, y1: 2.4 }], hex(0xe6d9c4), hex(0x8c1f19));
  k.quad([-xw, 0.06, zw - 2.5], [xw, 0.06, zw - 2.5], [xw, eave, zw - 2.5], [-xw, eave, zw - 2.5], hex(0x2a100e, 0.6));
  k.mirrored(() => { k.use('plaster'); k.box(xw, hw, -0.4, eave + 1.2, -depth, -court, hex(0xe6d9c4), 'y-', 0.8); column(k, 1.5, -court - 0.3, 0.06, eave - 0.3, 0.15, RED); });
  k.use('paint'); k.box(-xw, xw, eave - 0.5, eave - 0.2, -court - 0.4, -court - 0.2, RED_D);
  k.use('glazed');
  roofPatch(k, f, -xw, xw, -court, zr, 10, 5, GREEN); roofPatch(k, f, -xw, xw, zb, zr, 10, 5, shade(GREEN, 0.92));
  eaveTiles(k, f, -xw, xw, -court, 1, GREEN_CAP, RED_D);
  const rp = ridgePath(f, -xw + 0.8, xw - 0.8, zr, 8);
  ridgeBeam(k, rp, 0.28, 0.45, GREEN_D);
  for (const s of [1, -1] as const) swallowTail(k, [s * (xw - 0.8), rp[0][1] + 0.2, zr], s, 1.0, 1.0, 0.26, 0.4, GREEN_D);
  // plain hall behind
  k.use('glazed');
  const zh0 = zb - 0.5, zh1 = -depth + 0.1, zm = (zh0 + zh1) / 2;
  const g: Field = (_x, z) => eave + 0.8 + (1 - Math.abs(z - zm) / ((zh0 - zh1) / 2)) * 2.4;
  roofPatch(k, g, -xw, xw, zh0, zm, 2, 2, GREEN); roofPatch(k, g, -xw, xw, zh1, zm, 2, 2, shade(GREEN, 0.92));
  k.use('plaster'); k.at({ z: -depth, ry: Math.PI }, () => k.wall(-hw, hw, -0.4, eave + 1.2, 0, 0.3, [], hex(0xe6d9c4)));
}
