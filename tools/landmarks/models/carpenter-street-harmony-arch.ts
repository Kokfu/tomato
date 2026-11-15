// Carpenter Street Harmony Arch (亲善门 / 亞答街牌坊): the ceremonial gateway across the west end of
// Carpenter Street, opened in 2007.
//
// An open gate, not a building: two red granite columns on plinths carry a stack of painted beams,
// a stone tablet and a red name board under an orange-tiled roof with upturned corners; lower side
// roofs on grey outer columns cover the footways. Traffic passes underneath.
//
// Measured: footprint 11.3 x 4.7 m (OSM). Estimated from one photograph of the east face: all
// heights and the column spacing. The west face is modelled as the mirror of the east face.
// Model origin = middle of the west side at ground level; the street runs along the z axis.
import { MeshBuilder, hex, shade } from '../kit/mesh.ts';
import { hipRoof } from '../kit/chinese.ts';
import { panelZ, squareRing } from '../kit/model.ts';
import type { ModelOutput, Plaque } from '../kit/model.ts';

const ZC = -2.44;                 // centre line of the gate (half the mapped depth)
const XC = 3.1, XO = 5.2;         // centre columns, outer columns
const TILE = { base: hex(0xe08a2c), rib: hex(0xf2a544), trim: hex(0x2f8f6a) };
const GRANITE = hex(0xb9584a), PLINTH = hex(0xcf7468), GREY = hex(0x8f8f8a), WHITE = hex(0xe9e6dc);
const TEAL = hex(0x2c7f8c), BLUE = hex(0x2f5fa8), GOLD = hex(0xdcb043), DARK = hex(0x1f3a40), STONE = hex(0x8a7d6c);

export function build(lod: 0 | 1): ModelOutput {
  const b = new MeshBuilder(lod);
  const plaques: Plaque[] = [];
  /** Run `fn` for both faces: z = offset in front of the gate's centre plane, face = +1 (west) or -1 (east). */
  const faces = (fn: (z: number, face: number) => void, off: number) => { fn(ZC + off, 1); fn(ZC - off, -1); };

  b.mirrored(() => {
    // centre column on its plinth
    b.box(XC - 0.52, XC + 0.52, 0, 0.95, ZC - 0.52, ZC + 0.52, PLINTH, ['y-'], shade(PLINTH, 1.1));
    b.box(XC - 0.27, XC + 0.27, 0.95, 6.85, ZC - 0.27, ZC + 0.27, GRANITE, ['y-']);
    if (b.detail) faces((z, f) => panelZ(b, XC - 0.34, XC + 0.34, 0.25, 0.75, z, hex(0x3a3532), f), 0.525);
    // outer column and the beam of the side bay
    b.box(XO - 0.26, XO + 0.26, 0, 0.5, ZC - 0.26, ZC + 0.26, shade(GREY, 0.9), ['y-']);
    b.box(XO - 0.18, XO + 0.18, 0.5, 4.0, ZC - 0.18, ZC + 0.18, GREY, ['y-']);
    b.box(XC + 0.27, XO + 0.3, 3.9, 4.28, ZC - 0.2, ZC + 0.2, TEAL, []);
    if (b.detail) faces((z, f) => { panelZ(b, XC + 0.4, XO + 0.2, 3.98, 4.2, z, BLUE, f); panelZ(b, XC + 0.9, XO - 0.3, 4.03, 4.15, z + 0.004 * f, GOLD, f); }, 0.205);
    hipRoof(b, { cx: (XC + XO) / 2 + 0.25, cz: ZC, hx: 1.7, hz: 1.55, yEave: 4.3, rise: 0.75, ridgeHalf: 0.95, lift: 0.34 }, TILE, { pitch: 0.3, ridgeH: 0.22, tails: 0.12, seed: 17 });
  });

  // --- between the centre columns: bracket band, two painted beams, stone tablet, board row ---
  const X0 = XC - 0.27;
  b.box(-X0, X0, 4.72, 4.95, ZC - 0.1, ZC + 0.1, DARK, []);
  b.box(-X0, X0, 4.95, 5.4, ZC - 0.2, ZC + 0.2, TEAL, []);
  b.box(-X0, X0, 5.55, 6.0, ZC - 0.2, ZC + 0.2, TEAL, []);
  b.box(-0.75, 0.75, 5.18, 5.78, ZC - 0.26, ZC + 0.26, STONE, []);
  b.box(-X0, X0, 6.05, 6.8, ZC - 0.12, ZC + 0.12, BLUE, []);
  b.box(-XC - 0.5, XC + 0.5, 6.8, 6.98, ZC - 0.4, ZC + 0.4, WHITE, []);
  if (b.detail) {
    faces((z, f) => {
      // beam paintings: framed panels with a gold dragon band, as on the photograph
      for (const y of [4.95, 5.55]) for (const [x0, x1, c] of [[-2.7, -1.9, 0xd9822b], [-1.8, -0.85, 0x2f5fa8], [0.85, 1.8, 0x2f5fa8], [1.9, 2.7, 0xd9822b]] as number[][]) {
        panelZ(b, x0, x1, y + 0.06, y + 0.39, z, GOLD, f);
        panelZ(b, x0 + 0.05, x1 - 0.05, y + 0.1, y + 0.35, z + 0.004 * f, hex(c), f);
        const cx = (x0 + x1) / 2;
        b.flat([[cx - 0.22, y + 0.225, z + 0.008 * f], [cx, y + 0.13, z + 0.008 * f], [cx + 0.22, y + 0.225, z + 0.008 * f], [cx, y + 0.32, z + 0.008 * f]], hex(0xf0ece0), [0, 0, f]);
      }
      // painted panels beside the name board
      for (const s of [1, -1]) { panelZ(b, s > 0 ? 1.45 : -2.75, s > 0 ? 2.75 : -1.45, 6.1, 6.75, z - 0.08 * f, GOLD, f); panelZ(b, s > 0 ? 1.5 : -2.7, s > 0 ? 2.7 : -1.5, 6.15, 6.7, z - 0.076 * f, hex(0x234f9a), f); b.flat([[s * 2.1 - 0.35, 6.25, z - 0.072 * f], [s * 2.1 + 0.35, 6.25, z - 0.072 * f], [s * 2.1 + 0.2, 6.6, z - 0.072 * f], [s * 2.1 - 0.25, 6.55, z - 0.072 * f]], hex(0xd8493a), [0, 0, f]); }
      // white bracket blocks under the eave
      for (let x = -3.4; x <= 3.41; x += 0.57) b.box(x - 0.11, x + 0.11, 6.98, 7.18, z + 0.2 * f - 0.11, z + 0.2 * f + 0.11, WHITE, []);
    }, 0.205);
    b.box(-XC - 0.3, XC + 0.3, 6.98, 7.18, ZC - 0.25, ZC + 0.25, shade(WHITE, 0.85), []);
  }
  // name boards: 亞答街 on the east face (photograph), 親善門 on the west face (OSM official name)
  plaques.push({ text: '亞答街', x: 0, y: 6.42, z: ZC - 0.125, w: 2.8, h: 0.66, ry: Math.PI, fg: '#f2d36b', bg: '#b3261e', basis: 'Commons photograph of the east face: board reads 亞答街' });
  plaques.push({ text: '親善門', x: 0, y: 6.42, z: ZC + 0.125, w: 2.8, h: 0.66, ry: 0, fg: '#f2d36b', bg: '#b3261e', basis: 'approximation: OSM official_name 亲善门 Harmony Arch; the west face was not seen in a reference' });

  // --- centre roof ---
  hipRoof(b, { cx: 0, cz: ZC, hx: 4.3, hz: 2.0, yEave: 7.18, rise: 1.15, ridgeHalf: 2.7, lift: 0.5 }, TILE, { pitch: 0.3, ridgeH: 0.32, tails: 0.22, seed: 13 });

  return {
    mesh: b,
    plaques,
    collision: {
      walls: [
        { ring: squareRing(-XC, ZC, 0.55), top: 6.8 }, { ring: squareRing(XC, ZC, 0.55), top: 6.8 },
        { ring: squareRing(-XO, ZC, 0.3), top: 4 }, { ring: squareRing(XO, ZC, 0.3), top: 4 },
      ],
      floors: [],
    },
  };
}
