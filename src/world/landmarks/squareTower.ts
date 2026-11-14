// Square Tower (1879) - APPROXIMATE procedural model.
// Mapped (OSM way 817868530): position, square outline, orientation, building:levels.
// Approximated: crenellated two-storey body with a taller central tower, openings, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, windowRing } from './kit.ts';

export const SQUARE_TOWER_BUILDING = 817868530;

const WHITE = col(0xf0ede3);
const WHITE_2 = col(0xe0dccf);
const WALK = col(0xb7b1a3);
const DARK = col(0x3a3835);

export const buildSquareTower: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [SQUARE_TOWER_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp);
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const bodyTop = gTop + Math.max(6.5, fp.h);

  m.walls(loc, g - 0.6, bodyTop, WHITE);
  m.cap(loc, [], bodyTop, WALK);
  m.crenels(loc, bodyTop, 0.85, WHITE, 1.5, 0.45);
  windowRing(m, loc, gTop + 0.4, gTop + 2.6, 12, 1.5, DARK); // doorway arch per side
  windowRing(m, loc, gTop + 4.1, gTop + 5.6, 3.6, 0.7, DARK);

  // Central tower rising above the parapet.
  const s = Math.min(fp.L, fp.W) * 0.24;
  const towerTop = bodyTop + 5.6;
  m.box(-s, s, -s, s, bodyTop - 0.1, towerTop, WHITE, WALK);
  m.box(-s - 0.2, s + 0.2, -s - 0.2, s + 0.2, towerTop - 0.75, towerTop - 0.4, WHITE_2);
  const top = [-s, -s, s, -s, s, s, -s, s];
  m.crenels(top, towerTop, 0.8, WHITE, 1.3, 0.4);
  windowRing(m, top, bodyTop + 1.8, bodyTop + 3.4, 2 * s, 0.7, DARK);
  return m.mesh(ctx, 'square-tower');
};
