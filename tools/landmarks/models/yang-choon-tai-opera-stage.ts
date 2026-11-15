// Yang Choon Tai (陽春臺), the historic wayang (Chinese opera) stage at the back of Lau Ya Keng
// Food Court, facing Hiang Thian Siang Ti Temple across Carpenter Street.
//
// A separate structure from both the temple and the food court hall: a raised timber stage with
// lattice screens between posts and two tiers of tiled roof with upturned corners, standing inside
// a tall stage house that is open toward the hall.
//
// Evidence is thin (one interior photograph and aerial imagery): the arrangement is as seen, the
// dimensions are estimates. Model origin = centre of the stage-house opening at floor level,
// 14 m behind the street wall; +Z looks out through the hall toward the temple.
import { MeshBuilder, hex, shade } from '../kit/mesh.ts';
import type { V3 } from '../kit/mesh.ts';
import { sag, roofQuad, roofRibs, eaveTrim, ridgeBeam, hipRoof, lantern } from '../kit/chinese.ts';
import type { Field } from '../kit/chinese.ts';
import { panelX, panelY, panelZ, paving, rectRing } from '../kit/model.ts';
import type { ModelOutput, Plaque } from '../kit/model.ts';

const HW = 4.8, D = 14.6, FL = 0.08;
const WALL_H = 8.7;
const SX = 4.2, SZ0 = -1.0, SZ1 = -7.0, SY = 1.7;       // stage platform: half width, front, back, floor height
const POSTS = [-4.0, -1.5, 1.5, 4.0];
const TILE = { base: hex(0x5d7266), rib: hex(0x76897d), trim: hex(0x3c4944) };
const TIMBER = hex(0x5a2a20), TIMBER_D = hex(0x34201a), LATTICE = hex(0x7d3527), DARK = hex(0x2b2622), GOLD = hex(0xcfa63c), RED = hex(0xb8322a);

/** Apron roof along the stage front: eave at z = -0.35, rising back to the upper wall. */
const apron: Field = (x, z) => 4.45 + 0.7 * sag(Math.max(0, Math.min(1, (-0.35 - z) / 1.2))) + 0.38 * Math.pow(Math.min(1, Math.abs(x) / 4.5), 3);

export function build(lod: 0 | 1): ModelOutput {
  const b = new MeshBuilder(lod);
  const plaques: Plaque[] = [];

  // --- stage house: walls, sheet-metal hip roof (ridge along the depth), proscenium fascia ---
  b.box(-HW, HW, -0.6, FL, -D, 0, shade(DARK, 0.8), ['y-', 'y+']);
  b.mirrored(() => {
    b.box(HW - 0.02, HW + 0.2, -0.5, WALL_H, -D, 0, hex(0x8f8a80), ['y-', 'x-']);
    panelX(b, HW - 0.02, 0, -D, FL, WALL_H, [shade(DARK, 1.0), shade(DARK, 1.0), shade(DARK, 1.5), shade(DARK, 1.5)], -1);
  });
  b.box(-HW, HW, -0.5, WALL_H, -D - 0.2, -D, hex(0x8f8a80), ['y-']);
  b.box(-HW, HW, 7.7, WALL_H + 0.05, -0.22, 0, hex(0x4a2019), []);
  b.push({ z: -D / 2, rotY: Math.PI / 2 });
  hipRoof(b, { cx: 0, cz: 0, hx: D / 2 + 0.3, hz: HW + 0.3, yEave: WALL_H, rise: 1.7, ridgeHalf: D / 2 - 3.4, lift: 0 }, { base: hex(0xa5463a), rib: hex(0xb65548), trim: hex(0x7c3229) }, { plain: true, pitch: 0.75 });
  b.pop();

  if (b.detail) {
    // --- hall floor continues to the foot of the stage ---
    paving(b, -HW, HW, 0, SZ0, FL, 0.6, hex(0xd9cdb2), hex(0xcbbfa3));
    panelY(b, -HW, HW, SZ0, -D, FL, shade(DARK, 0.7));

    // --- raised stage: boarded base, floor, back wall ---
    b.box(-SX, SX, FL, SY, SZ1, SZ0, TIMBER_D, ['y-'], hex(0x6b4a34));
    for (let i = 0; i < 14; i++) { const x = -SX + 0.3 + i * 0.6; panelZ(b, x - 0.22, x + 0.22, FL + 0.12, SY - 0.2, SZ0 + 0.01, shade(TIMBER, 0.85)); }
    b.box(-SX - 0.05, SX + 0.05, SY - 0.12, SY + 0.02, SZ0 - 0.1, SZ0 + 0.06, RED, []);
    panelZ(b, -SX, SX, SY, 7.7, SZ1, [DARK, DARK, shade(DARK, 0.6), shade(DARK, 0.6)]);
    panelZ(b, -2.6, 2.6, SY, 4.6, SZ1 + 0.02, hex(0x7a1712));               // back curtain
    // wings closing the gap to the house walls
    b.mirrored(() => {
      b.box(SX, HW - 0.02, FL, 7.7, SZ0 - 0.25, SZ0 - 0.05, TIMBER_D, ['y-']);
      panelZ(b, SX + 0.08, HW - 0.1, FL, 2.1, SZ0 - 0.04, shade(TIMBER, 0.7));
    });

    // --- posts, lattice screens, shrine in the centre bay ---
    const zf = SZ0 - 0.18;
    for (const x of POSTS) b.lathe(x, zf, [[0.15, SY], [0.13, 4.5]], 7, hex(0x6e2219));
    b.mirrored(() => {
      const x0 = 1.63, x1 = 3.87;
      panelZ(b, x0, x1, SY, 4.3, zf - 0.03, hex(0x21110e));
      panelZ(b, x0, x1, SY, 2.45, zf, TIMBER);
      panelZ(b, x0 + 0.25, x1 - 0.25, SY + 0.15, 2.3, zf + 0.008, shade(TIMBER, 0.75));
      for (let i = 0; i <= 11; i++) { const x = x0 + ((x1 - x0) * i) / 11; panelZ(b, x - 0.028, x + 0.028, 2.45, 4.3, zf, LATTICE); }
      for (const y of [2.45, 3.05, 3.7, 4.26]) panelZ(b, x0, x1, y, y + 0.06, zf + 0.004, LATTICE);
    });
    panelZ(b, -1.37, 1.37, SY, 2.35, zf, TIMBER);
    for (let i = 0; i <= 9; i++) { const x = -1.3 + (2.6 * i) / 9; panelZ(b, x - 0.025, x + 0.025, SY + 0.1, 2.3, zf + 0.006, LATTICE); }
    b.box(-0.9, 0.9, SY, 2.7, -2.9, -2.2, hex(0x9c1c16), ['y-'], GOLD);            // altar table
    b.box(-0.55, 0.55, 2.7, 3.7, -2.85, -2.45, GOLD, ['y-']);                     // shrine
    b.flat([[-0.75, 3.7, -2.4], [0.75, 3.7, -2.4], [0, 4.25, -2.4]], hex(0x8c1c15), [0, 0, 1]);
    panelZ(b, -0.3, 0.3, 2.85, 3.5, -2.44, hex(0x8c1c15));
    for (const x of [-1.05, 1.05]) { panelZ(b, x - 0.01, x + 0.01, 3.9, 4.45, zf + 0.25, DARK); lantern(b, x, 3.7, zf + 0.25, 0.2, false); }

    // --- lower tiled roof (apron) with upturned ends ---
    roofQuad(b, apron, [-4.5, -0.35], [4.5, -0.35], [4.5, -1.55], [-4.5, -1.55], 10, 3, TILE.base);
    const lines: [number, number, number, number][] = [];
    for (let x = -4.35; x < 4.5; x += 0.3) lines.push([x, -0.35, x, -1.55]);
    roofRibs(b, apron, lines, 3, TILE.rib);
    eaveTrim(b, apron, [-4.5, -0.35], [4.5, -0.35], [0, 0, 1], 10, 0.12, TILE.trim);
    for (const s of [1, -1]) { const lo: V3[] = [], hi: V3[] = []; for (let i = 0; i <= 3; i++) { const z = -0.35 - 0.4 * i; lo.push([s * 4.5, 4.4, z]); hi.push([s * 4.5, apron(4.5, z), z]); } b.grid([lo, hi], TILE.trim, { dir: [s, 0, 0] }, false); }
    const rb: V3[] = [];
    for (let i = 0; i <= 8; i++) { const x = -4.5 + 9 * (i / 8); rb.push([x, apron(x, -1.55) - 0.02, -1.5]); }
    ridgeBeam(b, rb, 0.2, 0.16, TILE.trim, 7, false, false);
    // --- upper wall with the name board, then the upper hip roof ---
    b.box(-3.7, 3.7, 5.1, 5.95, -4.4, -1.5, TIMBER, ['y-', 'y+']);
    b.box(-0.95, 0.95, 5.2, 5.82, -1.5, -1.42, hex(0x18120f), ['z-']);
    plaques.push({ text: '臺春陽', x: 0, y: 5.51, z: -1.41, w: 1.75, h: 0.52, ry: 0, fg: '#e9c35a', bg: '#18120f', basis: 'OSM node 12779002958 (name 阳春台 / 陽春臺); board position from the iPackTravel interior photograph, read right to left as on the street sign' });
    hipRoof(b, { cx: 0, cz: -2.95, hx: 4.0, hz: 2.0, yEave: 5.9, rise: 1.3, ridgeHalf: 2.3, lift: 0.42 }, TILE, { pitch: 0.3, ridgeH: 0.3, tails: 0.16, seed: 9, chips: false });
  }

  return {
    mesh: b,
    plaques,
    collision: {
      walls: [{ ring: rectRing(-HW, HW, SZ0, -D), top: 10 }],
      floors: [{ ring: rectRing(-HW, HW, 0, SZ0), h: FL }],
    },
  };
}
