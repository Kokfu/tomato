// Lau Ya Keng Food Court (阳春台茶室), 19 Carpenter Street, Kuching.
//
// Not a shoplot: an open-fronted roofed hall that fills one bay between its neighbours, directly
// opposite Hiang Thian Siang Ti Temple. Street front: red steel frame, a painted sign beam and
// roll-up blinds. Behind it a flat-roofed bay, then an arched roof on curved ribs over the open
// dining floor (round tables, stalls along both side walls, hanging lanterns, tiled floor). The
// hall is open at the back to the historic opera stage (separate model).
//
// Measured (aerial imagery): clear width 9.6 m, depth 14 m. Estimated: all heights, stall and
// table layout (representative, not surveyed).
import { MeshBuilder, hex, shade } from '../kit/mesh.ts';
import type { Col, V3 } from '../kit/mesh.ts';
import { lantern } from '../kit/chinese.ts';
import { panelX, panelY, panelZ, paving, rectRing, squareRing } from '../kit/model.ts';
import type { Collision, ModelOutput, Plaque } from '../kit/model.ts';

export const HALL = { hw: 4.8, depth: 14, floor: 0.08, eave: 6.0, crown: 8.4, flatBay: 4.5 };
const { hw: HW, depth: D, floor: FL, eave: EAVE, crown: CROWN, flatBay: BAY } = HALL;

const RED = hex(0xb5372b), YELLOW = hex(0xe7b83a), CREAM = hex(0xece6d2), WARM = hex(0xf0dd9a), RUST = hex(0x9c4a3c);
const STEEL = hex(0xb9bcc0), DARK = hex(0x4b3a30), MARBLE = hex(0xe9e6df), GOLD = hex(0xd8b24a);
const TILE_A = hex(0xd9cdb2), TILE_B = hex(0xcbbfa3);

/** Height of the arched roof at plan x (0 at the springing line). */
export const archY = (x: number) => EAVE + (CROWN - EAVE) * Math.sqrt(Math.max(0, 1 - (x / HW) * (x / HW)));

/** [x, zCentre, facing] of the stalls: facing = 1 looks toward +x (stall on the left wall). */
const STALLS: { z: number; side: 1 | -1; sign: string; bg: string; fg: string; basis: string }[] = [
  { z: -2.3, side: 1, sign: 'Sarawak Laksa 叻沙', bg: '#b3261e', fg: '#fff3c9', basis: 'OSM node 6168638587 (Mui Xin Laksa)' },
  { z: -5.2, side: 1, sign: 'Kueh Chap 粿汁', bg: '#1f5f3a', fg: '#fff3c9', basis: 'OSM node 6168660688 (Lau Ya Keng - Kuay Chap)' },
  { z: -8.1, side: 1, sign: 'Satay 沙爹', bg: '#e9c35a', fg: '#7a1612', basis: 'OSM node 6169628587 (Lau Ya Keng - Satay)' },
  { z: -11.0, side: 1, sign: 'Kolo Mee 哥罗面', bg: '#f4efe2', fg: '#b3261e', basis: 'dish list in the iPackTravel article; stall position representative' },
  { z: -3.4, side: -1, sign: 'Kopi · Teh 茶水', bg: '#3a2a1e', fg: '#f4e7c3', basis: 'representative drinks counter' },
  { z: -9.4, side: -1, sign: '陈记特色虾面', bg: '#b3261e', fg: '#ffe9a8', basis: 'iPackTravel article (Tan\'s Signature prawn noodle); stall position representative' },
];
const TABLE_X = [-2.0, 0, 2.0], TABLE_Z = [-2.4, -4.6, -6.8, -9.0, -11.2];

function tableSet(b: MeshBuilder, x: number, z: number): void {
  b.lathe(x, z, [[0.24, FL], [0.22, FL + 0.04], [0.05, FL + 0.08], [0.05, 0.72]], 8, DARK);
  b.lathe(x, z, [[0.44, 0.72], [0.46, 0.75], [0.46, 0.78]], 10, MARBLE);
  const top: V3[] = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; top.push([x + Math.cos(a) * 0.46, 0.78, z + Math.sin(a) * 0.46]); }
  b.flat(top, MARBLE, [0, 1, 0]);
  for (let k = 0; k < 4; k++) {
    b.push({ x, z, rotY: (k / 4) * Math.PI * 2 + 0.3 });
    // chair: seat, back, two leg frames (facing the table at -z)
    b.box(-0.2, 0.2, 0.42, 0.46, 0.5, 0.9, DARK, []);
    b.box(-0.2, 0.2, 0.46, 0.86, 0.87, 0.9, DARK, ['y-']);
    for (const s of [1, -1]) panelX(b, s * 0.19, 0.52, 0.88, FL, 0.42, shade(DARK, 0.8), s);
    b.pop();
  }
}

function stall(b: MeshBuilder, zc: number, side: 1 | -1, sign: Col, i: number): void {
  // Local frame: the wall is at x = 0, the customer side at +x.
  b.push({ x: -side * (HW - 0.04), z: zc, mirrorX: side < 0 });
  const L = 1.15, F = 1.3; // half length along the wall, depth from the wall
  b.box(F - 0.3, F, FL, 0.95, -L, L, STEEL, ['y-'], shade(STEEL, 1.1));          // front counter
  for (const s of [1, -1]) b.box(0.05, F - 0.3, FL, 0.95, s * L - (s > 0 ? 0.28 : 0), s * L + (s > 0 ? 0 : 0.28), shade(STEEL, 0.92), ['y-']);
  b.box(F - 0.28, F - 0.04, 0.95, 1.45, -L + 0.1, L - 0.6, hex(0xbfd6dc), ['y-']);  // glass food display
  b.box(0.05, 0.4, FL, 1.9, -L + 0.3, L - 0.3, hex(0x8a8d90), ['y-']);            // back bench / shelves
  if (b.detail) {
    for (let k = 0; k < 3; k++) b.lathe(F - 0.45 - (k % 2) * 0.25, -0.5 + k * 0.5, [[0.13, 0.95], [0.16, 1.2], [0.14, 1.22]], 7, hex(k === 1 ? 0xd7d7d2 : 0x9a9c9e)); // pots
    b.box(F - 0.2, F - 0.1, 0.95, 1.25, L - 0.5, L - 0.15, hex([0xd23a2c, 0x2e62b8, 0xe2b93a][i % 3]), ['y-']);
  }
  for (const s of [1, -1]) b.box(F - 0.06, F, 0.95, 2.2, s * L - 0.03, s * L + 0.03, hex(0x8d9093), ['y-']); // sign posts
  b.box(F - 0.08, F + 0.02, 2.2, 2.78, -L, L, sign, []);                         // signboard
  b.pop();
}

export function build(lod: 0 | 1): ModelOutput {
  const b = new MeshBuilder(lod);
  const plaques: Plaque[] = [];
  const collision: Collision = { walls: [], floors: [{ ring: rectRing(-HW, HW, 0, -D), h: FL }] };

  // --- floor ---
  b.box(-HW, HW, -0.6, FL, -D, 0, shade(TILE_B, 0.7), ['y-', 'y+']);
  paving(b, -HW, HW, 0, -D, FL, 0.6, TILE_A, TILE_B);

  // --- side walls (the neighbours' party walls, lined on the hall side) and the red steel columns ---
  const colZ = [-0.13, -BAY, -7.7, -10.9, -D + 0.13];
  b.mirrored((side) => {
    const wall = side > 0 ? WARM : CREAM; // +x: yellow wall, -x: white wall with upper windows
    panelX(b, HW - 0.02, 0, -D, FL, 1.1, shade(wall, 0.82), -1);
    panelX(b, HW - 0.02, 0, -D, 1.1, EAVE + 0.05, wall, -1);
    b.box(HW - 0.02, HW + 0.2, -0.5, EAVE + 0.25, -D, 0, shade(wall, 0.9), ['y-', 'x-']); // wall body, seen from outside / above
    for (const z of colZ) b.box(HW - 0.26, HW - 0.04, FL, EAVE, z - 0.11, z + 0.11, RED, ['y-']);
    if (b.detail && side < 0) for (const z of [-2.3, -6.1, -9.3, -12.4]) {
      panelX(b, HW - 0.03, z - 0.75, z + 0.75, 3.5, 4.9, hex(0x8a8f92), -1);
      panelX(b, HW - 0.035, z - 0.66, z + 0.66, 3.6, 4.8, hex(0x39424a), -1);
      panelX(b, HW - 0.04, z - 0.03, z + 0.03, 3.6, 4.8, hex(0x8a8f92), -1);
    }
    if (b.detail && side > 0) for (const z of [-6.0, -12.2]) panelX(b, HW - 0.03, z - 0.5, z + 0.5, 2.4, 3.3, hex(0xb3261e), -1); // red notice boards
  });
  for (const sx of [1, -1]) collision.walls.push({ ring: squareRing(sx * (HW - 0.15), -0.13, 0.16), top: EAVE });

  // --- street front: sign beam, blinds, roof edge ---
  b.box(-HW, HW, 4.55, 5.45, -0.26, 0, hex(0x7a1f1a), []);
  if (b.detail) {
    const cols = [0x2f5fa8, 0x2c8c84, 0xd9822b, 0x3f8f4f];
    for (const s of [1, -1]) for (let k = 0; k < 4; k++) {
      const x0 = s * (1.75 + k * 0.76), x1 = s * (1.75 + (k + 1) * 0.76 - 0.08);
      panelZ(b, Math.min(x0, x1), Math.max(x0, x1), 4.65, 5.35, 0.005, GOLD);
      panelZ(b, Math.min(x0, x1) + 0.05, Math.max(x0, x1) - 0.05, 4.7, 5.3, 0.01, hex(cols[k]));
      const cx = (x0 + x1) / 2;
      b.flat([[cx - 0.2, 5.0, 0.015], [cx, 4.8, 0.015], [cx + 0.2, 5.0, 0.015], [cx, 5.2, 0.015]], hex(cols[(k + 2) % 4], 1.25), [0, 0, 1]);
    }
    panelZ(b, -1.68, 1.68, 4.62, 5.38, 0.005, GOLD);
  }
  plaques.push({ text: '臺春陽', x: 0, y: 5.0, z: 0.012, w: 3.2, h: 0.68, ry: 0, fg: '#f0cf63', bg: '#8c1c15', basis: 'iPackTravel street-front photograph: sign beam reads 陽春臺 from right to left' });
  // blinds hanging below the beam
  const blind = (x0: number, x1: number, y0: number, graphic: boolean) => {
    const n = b.detail ? 6 : 1, rows: V3[][] = [];
    for (let j = 0; j <= n; j++) rows.push([[x0, 4.55 - ((4.55 - y0) * j) / n, -0.08], [x1, 4.55 - ((4.55 - y0) * j) / n, -0.08]]);
    b.grid(rows, (_i, j) => hex(0xe8dcc0, j % 2 ? 0.92 : 1), { dir: [0, 0, 1] }, false);
    b.box(x0, x1, y0 - 0.07, y0, -0.12, -0.04, hex(0xcbbf9f), []);
    if (graphic && b.detail) {
      panelZ(b, x0 + 0.25, x1 - 0.25, y0 + 0.08, y0 + 0.5, -0.07, hex(0xd9382b));
      const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([(x0 + x1) / 2 + Math.cos(a) * 0.45, y0 + 0.5 + Math.sin(a) * 0.42, -0.07]); }
      b.flat(pts, hex(0xf2c53d), [0, 0, 1]);
    }
  };
  blind(-4.45, -2.35, 3.2, false); blind(-2.25, -0.1, 3.55, true); blind(0.1, 2.25, 3.55, true); blind(2.35, 4.45, 3.2, false);
  plaques.push({ text: '古晋潮州公会', x: -3.4, y: 4.1, z: -0.07, w: 1.7, h: 0.36, ry: 0, fg: '#1f7a45', bg: '#f6f2e6', basis: 'iPackTravel street-front photograph: banner of the Kuching Teochew Association on the left blind' });
  b.box(-HW - 0.05, HW + 0.05, 5.95, 6.14, -0.1, 0.28, RED, []);

  // --- flat-roofed front bay on yellow beams ---
  b.box(-HW, HW, EAVE, EAVE + 0.1, -BAY, 0.2, RUST, ['y-']);
  panelY(b, -HW, HW, -BAY, 0.2, EAVE - 0.005, hex(0x6f5d49), -1);
  for (const z of [-0.5, -2.3, -4.2]) b.box(-HW + 0.04, HW - 0.04, EAVE - 0.28, EAVE - 0.01, z - 0.06, z + 0.06, YELLOW, []);

  // --- arched roof: curved ribs, purlins, translucent sheet ---
  const NA = b.detail ? 14 : 8;
  const arc: V3[] = [];
  for (let i = 0; i <= NA; i++) { const x = -HW * Math.cos((i / NA) * Math.PI); arc.push([x, archY(x), 0]); }
  b.material = 'glass';
  b.grid([arc.map((p) => [p[0], p[1], -BAY] as V3), arc.map((p) => [p[0], p[1], -D] as V3)], hex(0xf2d6cf), { dir: [0, 1, 0] });
  b.material = 'opaque';
  const ribZ: number[] = [];
  for (let i = 0; i <= 8; i++) ribZ.push(-BAY - ((D - BAY) * i) / 8);
  for (const z of b.detail ? ribZ : [ribZ[0], ribZ[8]]) b.sweep(arc.map((p) => [p[0], p[1] - 0.02, z] as V3), () => [[-0.045, -0.13], [0.045, -0.13], [0.045, 0], [-0.045, 0]], RED, false);
  if (b.detail) for (const k of [2, 4, 7, 10, 12]) b.box(arc[k][0] - 0.04, arc[k][0] + 0.04, arc[k][1] - 0.2, arc[k][1] - 0.13, -D, -BAY, CREAM, []);
  // lunette closing the arch above the flat bay
  b.flat(arc.map((p) => [p[0], Math.max(p[1], EAVE + 0.1), -BAY] as V3), RUST, [0, 0, 1]);
  // tie beams at the springing line
  for (const z of [-BAY, -D + 0.1]) b.box(-HW + 0.04, HW - 0.04, EAVE - 0.2, EAVE, z - 0.06, z + 0.06, RED, []);

  if (b.detail) {
    // --- lights and the big red lanterns under the arch ---
    b.material = 'glow';
    for (const z of [-1.4, -3.3]) for (const x of [-2.4, 2.4]) b.box(x - 0.6, x + 0.6, EAVE - 0.36, EAVE - 0.3, z - 0.04, z + 0.04, hex(0xfbfbf2), []);
    for (const z of [-6.9, -9.3, -11.7]) for (const x of [-2.9, 2.9]) b.box(x - 0.04, x + 0.04, archY(x) - 0.28, archY(x) - 0.22, z - 0.6, z + 0.6, hex(0xfbfbf2), []);
    b.material = 'opaque';
    for (const [x, y, z] of [[-1.1, 6.3, -6.3], [1.1, 6.5, -6.3], [-1.2, 5.7, -7.6], [1.2, 5.9, -7.6], [-0.75, 5.2, -8.8], [0.95, 5.35, -8.8]] as number[][]) {
      panelZ(b, x - 0.012, x + 0.012, y + 0.36, archY(x) - 0.1, z, DARK);
      lantern(b, x, y, z, 0.36, false);
      panelZ(b, x - 0.03, x + 0.03, y - 0.75, y - 0.36, z, GOLD);
    }
    // --- stalls and tables ---
    STALLS.forEach((s, i) => {
      stall(b, s.z, s.side, hex(parseInt(s.bg.slice(1), 16)), i);
      plaques.push({ text: s.sign, x: -s.side * (HW - 0.04 - 1.33), y: 2.49, z: s.z, w: 2.2, h: 0.5, ry: (s.side * Math.PI) / 2, fg: s.fg, bg: s.bg, basis: s.basis });
    });
    for (const z of TABLE_Z) for (const x of TABLE_X) tableSet(b, x, z);
  }
  for (const s of STALLS) collision.walls.push({ ring: s.side > 0 ? rectRing(-HW, -HW + 1.4, s.z - 1.2, s.z + 1.2) : rectRing(HW - 1.4, HW, s.z - 1.2, s.z + 1.2), top: 2.8 });
  for (const z of TABLE_Z) for (const x of TABLE_X) collision.walls.push({ ring: squareRing(x, z, 0.45), top: 0.8 });

  return { mesh: b, plaques, collision };
}
