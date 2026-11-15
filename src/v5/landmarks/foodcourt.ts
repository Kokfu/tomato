// Lau Ya Keng Food Court (阳春台茶室) and the Yang Choon Tai opera stage - V5 reconstruction.
//
// Evidence (iPackTravel article, linked in docs/V5_REPORT.md; viewed, not copied):
//  - street front: one tall open bay between two shophouses; red steel posts and a red steel roof
//    edge; a long painted sign beam with 陽春臺 in a yellow cartouche between coloured diamond
//    panels; four pale roll-down blinds with printed banners; cream floor tiles; cars at the kerb.
//  - interior: a translucent arched roof on curved ribs behind a flat-roofed front bay; red
//    columns; cream / yellow side walls with stalls along both; round marble-top tables with dark
//    chairs; red lanterns; at the far end a dark timber stage under two tiers of grey-green tiled
//    roof with upturned corners (the historic opera stage facing the temple).
// Measured in V4 from aerial imagery: clear width 9.6 m, hall depth 14 m. Estimated: all heights,
// the stall and table layout (representative), the stage dimensions (one photograph only).
import { Kit, hex, shade } from '../kit.ts';
import type { Col, V3 } from '../kit.ts';
import { lantern, sag, roofPatch, eaveTiles, ridgeBeam, swallowTail } from './chinese.ts';
import type { Field } from './chinese.ts';
import { atlasUV } from './atlas.ts';
import type { AtlasName } from './atlas.ts';

const HW = 4.8, D = 14, FL = 0.08, EAVE = 6.0, CROWN = 8.4, BAY = 4.5;
const RED = hex(0xb5372b), YELLOW = hex(0xe7b83a), CREAM = hex(0xece6d2), WARM = hex(0xf0dd9a), STEEL = hex(0xb9bcc0), DARK = hex(0x3d2f28), MARBLE = hex(0xe9e6df);
const archY = (x: number) => EAVE + (CROWN - EAVE) * Math.sqrt(Math.max(0, 1 - (x / HW) * (x / HW)));

const STALLS: { z: number; side: 1 | -1; sign: AtlasName }[] = [
  { z: -2.3, side: 1, sign: 'stall0' }, { z: -5.2, side: 1, sign: 'stall1' }, { z: -8.1, side: 1, sign: 'stall2' }, { z: -11.0, side: 1, sign: 'stall3' },
  { z: -3.4, side: -1, sign: 'stall4' }, { z: -9.4, side: -1, sign: 'stall5' },
];
const TABLE_X = [-2.0, 0, 2.0], TABLE_Z = [-2.4, -4.6, -6.8, -9.0, -11.2];

function chair(k: Kit, c: Col): void {
  // stackable plastic chair facing -z (toward the table)
  k.use('paint');
  k.box(-0.2, 0.2, 0.43, 0.46, 0.5, 0.9, c, '');
  k.box(-0.2, 0.2, 0.76, 0.84, 0.875, 0.9, c, '');
  k.box(-0.2, 0.2, 0.6, 0.66, 0.875, 0.9, c, '');
  for (const sx of [-0.19, 0.17]) k.box(sx, sx + 0.02, 0.46, 0.84, 0.875, 0.9, c, 'y-');
  for (const sx of [-0.18, 0.18]) for (const sz of [0.53, 0.87]) k.box(sx - 0.018, sx + 0.018, FL, 0.43, sz - 0.018, sz + 0.018, shade(c, 0.8), 'y+y-');
}

function tableSet(k: Kit, x: number, z: number, i: number): void {
  k.use('paint');
  k.lathe(x, z, [[0.26, FL], [0.24, FL + 0.03], [0.05, FL + 0.07], [0.05, 0.72]], 10, hex(0x2e2a28));
  k.use('stone');
  k.cyl(x, z, 0.72, 0.76, 0.46, 0.47, 28, MARBLE, true);
  if (!k.detail) return;
  for (let q = 0; q < 4; q++) {
    if ((i * 7 + q * 3) % 11 === 0) continue; // a few chairs pulled away
    k.at({ x, z, ry: (q / 4) * Math.PI * 2 + 0.3 + (i % 3) * 0.2 }, () => chair(k, (i + q) % 5 === 0 ? hex(0xb3261e) : DARK));
  }
  // bowls / condiment set on some tables
  if (i % 2 === 0) { k.use('paint'); k.cyl(x + 0.1, z - 0.05, 0.76, 0.84, 0.05, 0.05, 7, hex(0xc8281e), true); k.cyl(x - 0.08, z + 0.1, 0.76, 0.81, 0.07, 0.09, 8, hex(0xf2f0ea), true); }
}

function stall(k: Kit, zc: number, side: 1 | -1, sign: AtlasName, i: number): void {
  // Stall frame: wall at x = 0, customers at +x.
  k.at({ x: -side * (HW - 0.04), z: zc, mirrorX: side < 0 }, () => {
    const L = 1.15, F = 1.3;
    k.use('gold');
    k.box(F - 0.3, F, FL, 0.95, -L, L, STEEL, 'y-', 0.7);
    for (const s of [1, -1]) k.box(0.05, F - 0.3, FL, 0.95, s > 0 ? L - 0.28 : -L, s > 0 ? L : -L + 0.28, shade(STEEL, 0.9), 'y-', 0.7);
    k.use('glass');
    k.box(F - 0.28, F - 0.04, 0.95, 1.45, -L + 0.1, L - 0.6, hex(0xbfd6dc, 0.5), 'y-');
    k.use('paint');
    k.box(0.05, 0.4, FL, 1.9, -L + 0.3, L - 0.3, hex(0x8a8d90), 'y-', 0.7);
    if (k.detail) {
      for (let q = 0; q < 3; q++) k.lathe(F - 0.5 - (q % 2) * 0.25, -0.5 + q * 0.5, [[0.13, 0.95], [0.17, 1.2], [0.15, 1.22]], 9, hex(q === 1 ? 0xd7d7d2 : 0x9a9c9e));
      k.box(F - 0.2, F - 0.1, 0.95, 1.25, L - 0.5, L - 0.15, hex([0xd23a2c, 0x2e62b8, 0xe2b93a][i % 3]), 'y-');
      for (const s of [1, -1]) k.box(F - 0.06, F, 0.95, 2.2, s * L - 0.03, s * L + 0.03, hex(0x8d9093), 'y-');
      // gas cylinder, stacked bowls, hanging menu board behind the counter
      k.lathe(F + 0.22, L + 0.02, [[0.14, FL], [0.15, 0.5], [0.1, 0.62], [0.05, 0.66]], 9, hex(i % 2 ? 0xc8452f : 0x3f6fae));
      for (let q = 0; q < 5; q++) k.cyl(F - 0.5, -L + 0.3, 0.95 + q * 0.035, 0.98 + q * 0.035, 0.07, 0.09, 8, hex(0xf2f0ea), true);
      k.use('atlas'); { const u = atlasUV('menu'); k.quad([0.42, 1.25, -L + 0.4], [0.42, 1.25, L - 0.4], [0.42, 2.0, L - 0.4], [0.42, 2.0, -L + 0.4], [0.95, 0.95, 0.95], u); }
      k.use('paint');
    }
    k.box(F - 0.08, F - 0.01, 2.2, 2.78, -L, L, hex(0x333333), '');
    k.use('atlas');
    const uv = atlasUV(sign);
    k.quad([F, 2.22, L - 0.02], [F, 2.22, -L + 0.02], [F, 2.76, -L + 0.02], [F, 2.76, L - 0.02], [1, 1, 1], side > 0 ? uv : [uv[2], uv[1], uv[0], uv[3]]);
    // tube light under the signboard
    k.use('glow');
    k.box(F - 0.2, F - 0.14, 2.1, 2.15, -L + 0.2, L - 0.2, hex(0xf6f6ee));
  });
}

function hallShell(k: Kit, authored: boolean): void {
  // floor
  k.use('paving');
  k.box(-HW, HW, -0.5, FL, -D, 0, hex(0xd9cdb2), 'y-');
  // side walls (the neighbours' party walls, lined on the hall side) and red steel columns
  const colZ = [-0.13, -BAY, -7.7, -10.9, -D + 0.13];
  k.mirrored((side) => {
    const wall = authored ? (side > 0 ? WARM : CREAM) : CREAM;
    k.use('plaster');
    k.at({ x: HW - 0.02, ry: -Math.PI / 2 }, () => k.wall(-D, 0, FL, EAVE + 0.05, 0, 0.2, k.detail && side < 0 && authored ? [-12.4, -9.3, -6.1, -2.3].map((z) => ({ x0: z - 0.7, x1: z + 0.7, y0: 3.5, y1: 4.9 })) : [], authored ? wall : shade(wall, 0.85), shade(wall, 0.6), 0.85));
    if (k.detail && side < 0 && authored) for (const z of [-12.4, -9.3, -6.1, -2.3]) {
      k.use('glass'); k.quad([HW + 0.14, 3.5, z + 0.7], [HW + 0.14, 3.5, z - 0.7], [HW + 0.14, 4.9, z - 0.7], [HW + 0.14, 4.9, z + 0.7], hex(0x39424a));
      k.use('paint'); k.box(HW + 0.1, HW + 0.14, 3.5, 4.9, z - 0.03, z + 0.03, hex(0x8a8f92));
    }
    k.use('plaster');
    k.box(HW + 0.18, HW + 0.22, -0.5, EAVE + 0.25, -D, 0, shade(wall, 0.9), 'y-x-');
    k.use('paint');
    for (const z of colZ) {
      // I-section post
      k.box(HW - 0.26, HW - 0.04, FL, EAVE, z - 0.015, z + 0.015, RED, 'y-');
      k.box(HW - 0.27, HW - 0.25, FL, EAVE, z - 0.09, z + 0.09, RED, 'y-');
      k.box(HW - 0.05, HW - 0.03, FL, EAVE, z - 0.09, z + 0.09, RED, 'y-');
    }
    if (k.detail && authored) {
      // wall fans and a notice board
      for (const z of [-6.2, -12.0]) { k.use('paint'); k.cyl(HW - 0.2, z, 3.0, 3.03, 0.02, 0.02, 4, hex(0x444444), false); k.at({ x: HW - 0.32, y: 3.1, z, rz: Math.PI / 2 }, () => k.cyl(0, 0, -0.03, 0.03, 0.24, 0.24, 12, hex(0x2c2c2c), true)); }
      if (side > 0) { k.use('atlas'); const u = atlasUV('menu'); k.quad([HW - 0.035, 2.3, -7.2], [HW - 0.035, 2.3, -5.6], [HW - 0.035, 3.3, -5.6], [HW - 0.035, 3.3, -7.2], [0.9, 0.9, 0.9], u); }
    }
  });
}

/** Authored reconstruction (Approach B). */
export function buildFoodCourt(k: Kit): void {
  hallShell(k, true);
  // --- street front: red roof edge, sign beam, blinds ---
  k.use('paint');
  k.box(-HW - 0.05, HW + 0.05, 5.95, 6.14, -0.1, 0.3, RED, '');
  k.use('zinc');
  k.quad([-HW - 0.05, 5.98, 1.25], [HW + 0.05, 5.98, 1.25], [HW + 0.05, 6.5, -0.4], [-HW - 0.05, 6.5, -0.4], hex(0x9c3a2e));
  k.quad([HW + 0.05, 5.95, 1.25], [-HW - 0.05, 5.95, 1.25], [-HW - 0.05, 6.47, -0.4], [HW + 0.05, 6.47, -0.4], hex(0x6a2a22, 0.6));
  k.use('paint');
  k.box(-HW - 0.05, HW + 0.05, 5.86, 5.98, 1.22, 1.27, RED, '');
  for (const sx of [-HW + 0.3, HW - 0.3]) for (const q of [0.3, 1.0]) k.tube([[sx, 6.0, q], [sx + (sx < 0 ? -0.25 : 0.25), 5.9, 0.02]], 0.02, 4, RED);
  for (const sx of [-HW - 0.12, HW + 0.12]) k.tube([[sx, 5.9, 1.2], [sx, 5.6, 0.2], [sx, 0.2, 0.2]], 0.045, 6, hex(0x9a3a2e));
  k.use('zinc');
  k.use('paint');
  k.box(-HW, HW, 4.55, 5.45, -0.26, 0, hex(0x7a1f1a), '');
  k.use('atlas');
  k.quad([-HW + 0.1, 4.6, 0.006], [HW - 0.1, 4.6, 0.006], [HW - 0.1, 5.4, 0.006], [-HW + 0.1, 5.4, 0.006], [1, 1, 1], atlasUV('lykSign'));
  const blind = (x0: number, x1: number, y0: number, name: AtlasName) => {
    k.use('atlas');
    const u = atlasUV(name), n = k.detail ? 5 : 1;
    for (let j = 0; j < n; j++) {
      const ya = 4.55 - ((4.55 - y0) * j) / n, yb = 4.55 - ((4.55 - y0) * (j + 1)) / n, bulge = (j % 2 ? 0.02 : -0.01);
      const va = u[3] - ((u[3] - u[1]) * j) / n, vb = u[3] - ((u[3] - u[1]) * (j + 1)) / n;
      k.poly([[x0, yb, -0.08 - bulge], [x1, yb, -0.08 - bulge], [x1, ya, -0.08 + bulge], [x0, ya, -0.08 + bulge]], [1, 1, 1], [[u[0], vb], [u[2], vb], [u[2], va], [u[0], va]]);
    }
    k.use('paint'); k.tube([[x0, y0 - 0.03, -0.08], [x1, y0 - 0.03, -0.08]], 0.035, 6, hex(0xcbbf9f));
  };
  blind(-4.45, -2.35, 3.2, 'blindA'); blind(-2.25, -0.1, 3.55, 'blindB'); blind(0.1, 2.25, 3.55, 'blindC'); blind(2.35, 4.45, 3.2, 'blindD');

  // --- flat-roofed front bay on yellow beams ---
  k.use('zinc');
  k.box(-HW, HW, EAVE, EAVE + 0.1, -BAY, 0.2, hex(0x9c4a3c), 'y-');
  k.use('paint');
  k.quad([-HW, EAVE - 0.005, 0.2], [HW, EAVE - 0.005, 0.2], [HW, EAVE - 0.005, -BAY], [-HW, EAVE - 0.005, -BAY], hex(0x6f5d49, 0.6));
  for (const z of [-0.5, -2.3, -4.2]) k.box(-HW + 0.04, HW - 0.04, EAVE - 0.28, EAVE - 0.01, z - 0.06, z + 0.06, YELLOW, '');

  // --- arched roof: translucent sheet on curved red ribs with purlins ---
  const NA = k.detail ? 16 : 8;
  const arc: V3[] = [];
  for (let i = 0; i <= NA; i++) { const x = -HW * Math.cos((i / NA) * Math.PI); arc.push([x, archY(x), 0]); }
  k.use('poly');
  k.grid([arc.map((p) => [p[0], p[1], -D] as V3), arc.map((p) => [p[0], p[1], -BAY] as V3)], hex(0xf2e2d6), true, 1);
  k.use('paint');
  const ribs = k.detail ? 9 : 2;
  for (let i = 0; i < ribs; i++) { const z = -BAY - ((D - BAY) * i) / (ribs - 1); k.tube(arc.map((p) => [p[0], p[1] - 0.07, z] as V3), 0.05, 5, RED); }
  if (k.detail) for (const q of [2, 4, 6, 8, 10, 12, 14]) k.box(arc[q][0] - 0.03, arc[q][0] + 0.03, arc[q][1] - 0.16, arc[q][1] - 0.1, -D, -BAY, CREAM, '');
  k.use('zinc');
  k.poly(arc.map((p) => [p[0], Math.max(p[1], EAVE + 0.1), -BAY] as V3), hex(0x9c4a3c));
  k.use('paint');
  for (const z of [-BAY, -D + 0.1]) k.box(-HW + 0.04, HW - 0.04, EAVE - 0.2, EAVE, z - 0.06, z + 0.06, RED, '');

  if (k.detail) {
    k.use('glow');
    for (const z of [-1.4, -3.3]) for (const x of [-2.4, 2.4]) k.box(x - 0.6, x + 0.6, EAVE - 0.36, EAVE - 0.3, z - 0.04, z + 0.04, hex(0xfbfbf2), '');
    for (const [x, y, z] of [[-1.1, 6.3, -6.3], [1.1, 6.5, -6.3], [-1.2, 5.7, -7.6], [1.2, 5.9, -7.6], [-0.75, 5.2, -8.8], [0.95, 5.35, -8.8]]) {
      k.use('paint'); k.cyl(x, z, y + 0.36, archY(x) - 0.1, 0.008, 0.008, 3, hex(0x333333), false);
      lantern(k, x, y, z, 0.36);
    }
  }
  STALLS.forEach((s, i) => stall(k, s.z, s.side, s.sign, i));
  let ti = 0;
  for (const z of TABLE_Z) for (const x of TABLE_X) tableSet(k, x, z, ti++);
}

/** Rule-based food court (Approach A): an open hall under a plain roof with a generic table grid. */
export function buildGenericFoodCourt(k: Kit): void {
  hallShell(k, false);
  k.use('zinc');
  k.quad([-HW - 0.1, EAVE + 0.1, 0.4], [HW + 0.1, EAVE + 0.1, 0.4], [HW + 0.1, EAVE + 1.3, -D / 2], [-HW - 0.1, EAVE + 1.3, -D / 2], hex(0xa9aeb0));
  k.quad([HW + 0.1, EAVE + 0.1, -D], [-HW - 0.1, EAVE + 0.1, -D], [-HW - 0.1, EAVE + 1.3, -D / 2], [HW + 0.1, EAVE + 1.3, -D / 2], hex(0x9a9fa1));
  k.quad([HW, EAVE + 0.08, 0.4], [-HW, EAVE + 0.08, 0.4], [-HW, EAVE + 1.28, -D / 2], [HW, EAVE + 1.28, -D / 2], hex(0x6f6f6a, 0.5));
  k.quad([-HW, EAVE + 0.08, -D], [HW, EAVE + 0.08, -D], [HW, EAVE + 1.28, -D / 2], [-HW, EAVE + 1.28, -D / 2], hex(0x6f6f6a, 0.5));
  k.use('paint');
  k.box(-HW, HW, EAVE - 0.4, EAVE, -0.2, 0, hex(0x8a8d8f), '');
  let ti = 0;
  for (const z of TABLE_Z) for (const x of TABLE_X) tableSet(k, x, z, ti++);
}

// ---------------------------------------------------------------- opera stage

const S = { hw: 4.8, d: 14.6, wallH: 8.7, sx: 4.2, z0: -1.0, z1: -7.0, y: 1.6 };
const TIMBER = hex(0x7a3526), TIMBER_D = hex(0x4a2a20), TILE = hex(0x4f8a6c), TILE_D = hex(0x2f5a46);

/** Authored reconstruction of the Yang Choon Tai stage (Approach B). Origin: centre of the stage-house opening. */
export function buildOperaStage(k: Kit): void {
  const { hw, d, wallH, sx, z0, z1, y: SY } = S;
  // stage house: side and rear walls, sheet-metal roof
  k.use('paving');
  k.box(-hw, hw, -0.5, FL, z0, 0, hex(0xd9cdb2), 'y-');
  k.use('concrete');
  k.box(-hw, hw, -0.5, FL, -d, z0, hex(0x4a4640), 'y-');
  k.mirrored(() => {
    k.use('plaster');
    k.at({ x: hw - 0.02, ry: -Math.PI / 2 }, () => k.wall(-d, 0, FL, wallH, 0, 0.2, [], hex(0xa89a86), undefined, 0.7));
    k.box(hw + 0.18, hw + 0.22, -0.5, wallH, -d, 0, hex(0x8f8a80), 'y-x-');
  });
  k.use('plaster');
  k.at({ z: -d - 0.2, ry: Math.PI }, () => k.wall(-hw, hw, -0.5, wallH, 0, 0.2, [], hex(0x8f8a80)));
  k.use('zinc');
  const rz = -d / 2;
  k.quad([-hw - 0.3, wallH, 0.3], [hw + 0.3, wallH, 0.3], [hw * 0.3, wallH + 1.7, rz], [-hw * 0.3, wallH + 1.7, rz], hex(0xa5463a));
  k.quad([hw + 0.3, wallH, -d - 0.3], [-hw - 0.3, wallH, -d - 0.3], [-hw * 0.3, wallH + 1.7, rz], [hw * 0.3, wallH + 1.7, rz], hex(0x96402f));
  k.quad([hw + 0.3, wallH, 0.3], [hw + 0.3, wallH, -d - 0.3], [hw * 0.3, wallH + 1.7, rz], [hw * 0.3, wallH + 1.7, rz], hex(0x9c4234));
  k.quad([-hw - 0.3, wallH, -d - 0.3], [-hw - 0.3, wallH, 0.3], [-hw * 0.3, wallH + 1.7, rz], [-hw * 0.3, wallH + 1.7, rz], hex(0x9c4234));
  k.use('timber');
  k.box(-hw, hw, 7.7, wallH + 0.05, -0.22, 0, hex(0x4a2019), '');

  // raised timber stage with boarded front
  k.box(-sx, sx, FL, SY, z1, z0, hex(0x6b4a34, 0.9), 'y-', 0.6);
  k.use('paint');
  k.box(-sx - 0.05, sx + 0.05, SY - 0.12, SY + 0.02, z0 - 0.1, z0 + 0.06, hex(0xb8322a), '');
  k.use('plaster');
  k.quad([-sx, SY, z1], [sx, SY, z1], [sx, 7.7, z1], [-sx, 7.7, z1], hex(0x4a3a32));
  k.use('glow');
  for (const x of [-2.6, 0, 2.6]) k.box(x - 0.5, x + 0.5, 4.1, 4.15, z0 - 0.7, z0 - 0.64, hex(0xfff2d0));
  k.use('plaster');
  k.use('fabric');
  k.quad([-2.6, SY, z1 + 0.03], [2.6, SY, z1 + 0.03], [2.6, 4.5, z1 + 0.03], [-2.6, 4.5, z1 + 0.03], hex(0x7a1712, 0.8));
  k.mirrored(() => { k.use('timber'); k.box(sx, hw - 0.02, FL, 7.7, z0 - 0.25, z0 - 0.05, TIMBER_D, 'y-'); });

  // posts, lattice screens in the outer bays, beams
  const posts = [-4.0, -1.5, 1.5, 4.0];
  k.use('timber');
  for (const x of posts) k.cyl(x, z0 - 0.3, SY, 4.5, 0.11, 0.1, k.detail ? 10 : 5, TIMBER, false, 0.7);
  k.box(-sx, sx, 4.2, 4.5, z0 - 0.42, z0 - 0.18, TIMBER, '');
  if (k.detail) {
    k.use('atlas');
    const u = atlasUV('lattice');
    for (const [a, b] of [[-3.9, -1.6], [1.6, 3.9]]) k.quad([a, SY + 0.9, z0 - 0.3], [b, SY + 0.9, z0 - 0.3], [b, 4.2, z0 - 0.3], [a, 4.2, z0 - 0.3], [0.9, 0.9, 0.9], [u[0], u[1], u[0] + (u[2] - u[0]) * 1.0, u[3]]);
    k.use('timber');
    for (const [a, b] of [[-3.9, -1.6], [1.6, 3.9]]) k.box(a, b, SY, SY + 0.9, z0 - 0.33, z0 - 0.27, TIMBER_D, 'y-');
    k.use('atlas');
    k.box(-1.25, 1.25, 4.56, 5.2, z0 - 0.28, z0 - 0.2, [0.1, 0.08, 0.07] as Col, '');
    k.quad([-1.2, 4.6, z0 - 0.19], [1.2, 4.6, z0 - 0.19], [1.2, 5.16, z0 - 0.19], [-1.2, 5.16, z0 - 0.19], [1, 1, 1], atlasUV('stageBoard'));
    for (const x of [-0.75, 0.75]) lantern(k, x, 3.75, z0 - 0.1, 0.2);
    k.use('glow');
    k.box(-1.1, 1.1, 5.24, 5.29, z0 - 0.12, z0 - 0.06, hex(0xfff2d0));
  }
  // lower apron roof over the stage front and the upper hip roof with upturned corners
  const apron: Field = (x, z) => 4.5 + 0.75 * sag(Math.max(0, Math.min(1, (-0.3 - z) / 1.3))) + 0.42 * Math.pow(Math.min(1, Math.abs(x) / 4.6), 3);
  k.use('glazed');
  roofPatch(k, apron, -4.6, 4.6, -0.3, -1.6, k.detail ? 12 : 3, k.detail ? 3 : 1, TILE);
  eaveTiles(k, apron, -4.6, 4.6, -0.3, 1, hex(0x7a9488), TIMBER_D, 0.22);
  const top: Field = (x, z) => 6.0 + 1.25 * sag(Math.max(0, Math.min(1, (-0.6 - z) / 2.4))) + 0.5 * Math.pow(Math.min(1, Math.abs(x) / 4.2), 3);
  k.use('timber');
  k.box(-3.9, 3.9, 5.35, 6.0, -1.9, -1.7, TIMBER_D, '');
  k.use('glazed');
  roofPatch(k, top, -4.2, 4.2, -0.6, -3.0, k.detail ? 12 : 3, k.detail ? 4 : 1, TILE);
  eaveTiles(k, top, -4.2, 4.2, -0.6, 1, hex(0x7a9488), TIMBER_D, 0.22);
  const rp: V3[] = [];
  for (let i = 0; i <= 6; i++) { const x = -3.2 + (6.4 * i) / 6; rp.push([x, top(x, -3.0) - 0.04, -3.0]); }
  ridgeBeam(k, rp, 0.26, 0.36, TILE_D);
  for (const s of [1, -1] as const) swallowTail(k, [s * 3.2, rp[0][1] + 0.16, -3.0], s, 0.9, 0.8, 0.22, 0.3, TILE_D);
}

/** Rule-based stage (Approach A): a platform in a plain shed. */
export function buildGenericStage(k: Kit): void {
  const { hw, d, wallH, sx, z0, z1, y: SY } = S;
  k.use('concrete'); k.box(-hw, hw, -0.5, FL, -d, 0, hex(0x6a665e), 'y-');
  k.mirrored(() => { k.use('plaster'); k.box(hw - 0.02, hw + 0.22, -0.5, wallH, -d, 0, hex(0x8f8a80), 'y-'); });
  k.use('plaster'); k.box(-hw, hw, -0.5, wallH, -d - 0.2, -d, hex(0x8f8a80), 'y-');
  k.use('zinc'); k.box(-hw - 0.3, hw + 0.3, wallH, wallH + 0.15, -d - 0.3, 0.3, hex(0xa9aeb0), '');
  k.use('timber'); k.box(-sx, sx, FL, SY, z1, z0, hex(0x6b4a34), 'y-', 0.6);
}
