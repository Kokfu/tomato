// Masjid India Bandar Kuching ("floating mosque", 2019) - APPROXIMATE procedural model.
// Mapped (OSM way 568501301): position, outline (mosque with its platform over the river edge).
// Approximated: platform, arcaded prayer hall, central and corner domes, two minarets on the
// river side, heights, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { WATER_LEVEL } from '../config.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, insetRing, towardWater, windowRing, onionProfile } from './kit.ts';

export const FLOATING_MOSQUE_BUILDING = 568501301;

const STONE = col(0xcfc8b8);
const WALL = col(0xf2ead9);
const WALL_2 = col(0xe3d8c0);
const GOLD = col(0xd6ab35);
const GOLD_2 = col(0xb98f2a);
const DARK = col(0x3c4a52);

export const buildFloatingMosque: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [FLOATING_MOSQUE_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp);
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const deck = gTop + 0.5;

  // Platform on the mapped outline (standing in the water on the river side).
  m.walls(loc, WATER_LEVEL - 1.5, deck, STONE);
  m.cap(loc, [], deck, STONE);

  // Prayer hall: the mapped outline inset by a terrace width.
  const terrace = Math.min(fp.W * 0.16, 7);
  const hall = insetRing(loc, terrace);
  const hallTop = deck + 9;
  m.walls(hall, deck, hallTop, WALL);
  m.cap(hall, [], hallTop, WALL_2);
  m.crenels(hall, hallTop, 0.7, WALL, 1.4, 0.3);
  windowRing(m, hall, deck + 0.4, deck + 5.6, 4.2, 2.2, DARK);
  windowRing(m, hall, deck + 6.6, deck + 7.8, 4.2, 1.2, DARK);

  // Domes.
  const R = Math.min(fp.L, fp.W) * 0.2;
  m.lathe(0, 0, [[R * 1.05, hallTop], [R * 1.05, hallTop + 3]], 12, WALL);
  m.lathe(0, 0, onionProfile(R, hallTop + 3), 12, (i) => (i % 2 ? GOLD : GOLD_2));
  const ea = fp.L / 2 - terrace - R * 0.9, eb = fp.W / 2 - terrace - R * 0.9;
  for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const r = R * 0.36;
    m.lathe(sa * ea, sb * eb, [[r * 1.05, hallTop], [r * 1.05, hallTop + 1.5]], 8, WALL);
    m.lathe(sa * ea, sb * eb, onionProfile(r, hallTop + 1.5), 8, GOLD);
  }

  // Minarets at the two river-side corners of the hall.
  const front = towardWater(fp, data, ctx) ?? [0, 1];
  const ma = fp.L / 2 - terrace * 0.55, mb = fp.W / 2 - terrace * 0.55;
  const corners: [number, number][] = front[1] !== 0 ? [[ma, front[1] * mb], [-ma, front[1] * mb]] : [[front[0] * ma, mb], [front[0] * ma, -mb]];
  for (const [a, bb] of corners) {
    const top = deck + 27;
    m.lathe(a, bb, [[1.5, deck], [1.25, deck + 14], [1.9, deck + 14.6], [1.9, deck + 15.6], [1.0, deck + 15.6], [0.85, top - 3], [1.4, top - 2.5], [1.4, top - 1.7], [0.8, top - 1.7]], 8, WALL);
    m.lathe(a, bb, onionProfile(0.9, top - 1.7), 8, GOLD);
  }
  return m.mesh(ctx, 'floating-mosque');
};
