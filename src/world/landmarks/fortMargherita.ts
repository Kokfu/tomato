// Fort Margherita (1879) - APPROXIMATE procedural model.
// Mapped (OSM relation 12489078): position, outer wall outline and the inner courtyard ring.
// Approximated: wall height, battlements, the three-storey crenellated tower block (placed at the
// widest solid part of the mapped outline, since the tower itself is not mapped separately),
// window slits, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, pointInRing, distToRing, windowRow, windowRing } from './kit.ts';

export const FORT_MARGHERITA_BUILDING = -12489078;

const WHITE = col(0xf1eee4);
const WHITE_2 = col(0xe4e0d4);
const WALK = col(0xb9b3a6);
const DARK = col(0x3c3a36);
const TIMBER = col(0x6a5140);

export const buildFortMargherita: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [FORT_MARGHERITA_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const ring = ringLocal(fp), holes = fp.holes.map((h) => ringLocal(fp, h));
  const g = fp.gMin, gTop = Math.max(fp.gMean, g);
  const wallTop = gTop + 6.6;

  // Curtain wall and enclosed ranges following the mapped rings, with battlements.
  m.walls(ring, g - 0.6, wallTop, WHITE);
  for (const h of holes) m.walls(h, gTop - 0.2, wallTop, WHITE_2, true);
  m.cap(ring, holes, wallTop, WALK);
  m.crenels(ring, wallTop, 0.9, WHITE, 1.7, 0.5);
  windowRing(m, ring, gTop + 3.4, gTop + 4.5, 4.2, 0.5, DARK);

  // Tower block: centred on the point of the solid part that is farthest from every wall line.
  let best = { a: 0, b: 0, d: 0 };
  for (let a = -fp.L / 2; a <= fp.L / 2; a += 0.75) {
    for (let bb = -fp.W / 2; bb <= fp.W / 2; bb += 0.75) {
      if (!pointInRing(a, bb, ring) || holes.some((h) => pointInRing(a, bb, h))) continue;
      let d = distToRing(a, bb, ring);
      for (const h of holes) d = Math.min(d, distToRing(a, bb, h));
      if (d > best.d) best = { a, b: bb, d };
    }
  }
  const s = Math.max(3.2, Math.min(5.2, best.d * 1.05));
  const a0 = best.a - s, a1 = best.a + s, b0 = best.b - s * 0.85, b1 = best.b + s * 0.85;
  const towerTop = gTop + 15.2;
  m.box(a0, a1, b0, b1, wallTop - 0.1, towerTop, WHITE, WALK);
  m.box(a0 - 0.25, a1 + 0.25, b0 - 0.25, b1 + 0.25, towerTop - 0.9, towerTop - 0.5, WHITE_2);
  const top = [a0, b0, a1, b0, a1, b1, a0, b1];
  m.crenels(top, towerTop, 1.0, WHITE, 1.5, 0.45);
  const inside: [number, number] = [best.a, best.b];
  for (const [y0, y1] of [[gTop + 8.2, gTop + 9.8], [gTop + 11.6, gTop + 13.2]]) {
    windowRow(m, a0, b0, a1, b0, y0, y1, 3, 0.9, DARK, inside);
    windowRow(m, a1, b0, a1, b1, y0, y1, 3, 0.9, DARK, inside);
    windowRow(m, a1, b1, a0, b1, y0, y1, 3, 0.9, DARK, inside);
    windowRow(m, a0, b1, a0, b0, y0, y1, 3, 0.9, DARK, inside);
  }
  // Flagstaff
  m.tube([best.a, towerTop, best.b], [best.a, towerTop + 6.5, best.b], 0.09, 0.05, 5, TIMBER);
  return m.mesh(ctx, 'fort-margherita');
};
