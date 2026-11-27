// Masjid India Bandar Kuching ("floating mosque", 2019) - procedural model.
// Mapped (OSM way 568501301): position, outline (mosque with its platform over the river edge).
// N1-M5: the form follows the one licensed photograph (see `verified` below); with ?m5=0 the earlier guess is drawn
// (platform, arcaded hall, gold central and corner domes, two minarets on the river side: none of it photographed).
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { WATER_LEVEL } from '../config.ts';
import { m5Enabled } from '../district/m5.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, insetRing, towardWater, windowRing, onionProfile } from './kit.ts';

export const FLOATING_MOSQUE_BUILDING = 568501301;

const STONE = col(0xcfc8b8);
const WALL = col(0xf2ead9);
const WALL_2 = col(0xe3d8c0);
const GOLD = col(0xd6ab35);
const GOLD_2 = col(0xb98f2a);
const DARK = col(0x3c4a52);

const legacy: LandmarkBuilder = ({ data, ctx }) => {
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

/** Verified counts and estimated heights of the N1-M5 form (metres above the deck). */
export const FLOATING_FORM = { minarets: 1, arcade: 5.6, upper: 8.6, drum: 12.0, minaretTop: 29.8, bay: 3.4 };

const WHITE = col(0xf4f1ea);
const WHITE_2 = col(0xe4e0d6);
const SHADE = col(0x4a4f52);
const SLATE = col(0x7f8f9e);
const SLATE_2 = col(0x70819a);
const FASCIA = col(0x9a958a);

/**
 * N1-M5 (hero place 6), VERIFIED FORM from one Commons photograph taken at night (Cerevisae, "Floating mosque near
 * Kuching river.jpg", CC BY-SA 4.0): a low white hall behind a continuous arcade of round arches on a railed deck
 * over the water, a set-back upper storey, a dome on a tall windowed drum over the middle, a smaller dome on a round
 * drum towards the water, and ONE slender minaret with three balconies rising from a square base beside it.
 * APPROXIMATE: every dimension; the colours (a night photograph: the dome reads dark and the minaret is lit blue, so
 * the walls are drawn white, the domes slate, and nothing is gold); where along the water side the minaret and the
 * small dome stand; the three faces the photograph does not show. The earlier model (gold domes, two minarets,
 * battlements) matched none of this and is kept for `?m5=0` only.
 */
const verified: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [FLOATING_MOSQUE_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp);
  const deck = Math.max(fp.gMin, fp.gMean) + 0.5, F = FLOATING_FORM;

  // Deck on the mapped outline, standing in the water, with a low white parapet.
  m.walls(loc, WATER_LEVEL - 1.5, deck, STONE);
  m.cap(loc, [], deck, STONE);
  m.walls(loc, deck, deck + 0.95, WHITE_2);
  m.walls(insetRing(loc, 0.2), deck, deck + 0.95, WHITE_2, true);

  const terrace = Math.min(fp.W * 0.14, 6);
  const hall = insetRing(loc, terrace);
  const up = insetRing(hall, Math.min(fp.W * 0.15, 5.5));
  const R = Math.min(7.2, Math.min(fp.L, fp.W) * 0.17);
  const front = towardWater(fp, data, ctx) ?? [0, 1];
  const alongA = front[1] !== 0;
  const half = (alongA ? fp.W : fp.L) / 2 - terrace - Math.min(fp.W * 0.15, 5.5) * 0.5;
  const at = (t: number, back: number): [number, number] => (alongA ? [t, front[1] * (half - back)] : [front[0] * (half - back), t]);
  const span = alongA ? fp.L : fp.W;
  const [da, db] = at(-span * 0.14, 0.4), r2 = R * 0.46;
  const [ma, mb] = at(span * 0.1, 0.2), s = 1.7, by = deck + 10.6;

  // N2-M0b: distant ('low') chunk silhouette (~260 tris vs ~1.8k).
  if (ctx.detail !== 'high') {
    m.walls(hall, deck, deck + F.arcade, WHITE);
    m.cap(hall, [], deck + F.arcade, WHITE_2);
    m.walls(up, deck + F.arcade, deck + F.upper, WHITE);
    m.cap(up, [], deck + F.upper, WHITE_2);
    m.lathe(0, 0, [[R, deck + F.upper], [R, deck + F.drum]], 8, WHITE);
    m.lathe(0, 0, [[R * 1.02, deck + F.drum], [R * 0.65, deck + F.drum + R * 0.75], [0, deck + F.drum + R * 1.06]], 8, SLATE);
    m.lathe(da, db, [[r2, deck + F.arcade], [r2 * 0.65, deck + F.arcade + 3.1 + r2 * 0.7], [0, deck + F.arcade + 3.1 + r2 * 1.06]], 6, SLATE);
    m.box(ma - s, ma + s, mb - s, mb + s, deck, by, WHITE, WHITE_2);
    m.lathe(ma, mb, [[0.95, by], [0.62, by + 17.0], [0, deck + F.minaretTop]], 6, WHITE);
    return m.mesh(ctx, 'floating-mosque');
  }

  // The arcaded hall: dark round-headed openings between white piers, a flat roof with a projecting edge.
  m.walls(hall, deck, deck + F.arcade, WHITE);
  windowRing(m, hall, deck + 0.25, deck + 3.5, F.bay, 2.3, SHADE);
  windowRing(m, hall, deck + 3.5, deck + 3.95, F.bay, 1.7, SHADE);
  windowRing(m, hall, deck + 3.95, deck + 4.2, F.bay, 0.9, SHADE);
  const eave = insetRing(hall, -0.7);
  m.walls(eave, deck + F.arcade - 0.35, deck + F.arcade, FASCIA);
  m.cap(eave, [], deck + F.arcade - 0.35, WHITE_2, true);
  m.cap(eave, [], deck + F.arcade, WHITE_2);

  // Set-back upper storey.
  m.walls(up, deck + F.arcade, deck + F.upper, WHITE);
  m.cap(up, [], deck + F.upper, WHITE_2);
  windowRing(m, up, deck + F.arcade + 0.8, deck + F.upper - 0.7, 3.6, 1.0, SHADE);
  m.walls(insetRing(up, -0.15), deck + F.upper - 0.25, deck + F.upper, FASCIA);

  // The dome on its windowed drum.
  m.lathe(0, 0, [[R * 1.12, deck + F.upper], [R * 1.12, deck + F.upper + 0.8], [R, deck + F.upper + 0.8], [R, deck + F.drum]], 14, WHITE);
  for (let k = 0; k < 14; k++) {
    const u = ((k + 0.5) / 14) * Math.PI * 2, r = R * Math.cos(Math.PI / 14) + 0.04, tx = -Math.sin(u), tz = Math.cos(u);
    const q = (d: number, y: number): [number, number, number] => [Math.cos(u) * r + tx * d, y, Math.sin(u) * r + tz * d];
    m.poly([q(-0.5, deck + F.upper + 1.3), q(0.5, deck + F.upper + 1.3), q(0.5, deck + F.drum - 0.6), q(-0.5, deck + F.drum - 0.6)], SHADE, [0, deck + 10, 0]);
  }
  const dome = (a: number, bb: number, r: number, y: number, n: number) => {
    m.lathe(a, bb, [[r * 1.04, y], [r, y + r * 0.26], [r * 0.86, y + r * 0.54], [r * 0.62, y + r * 0.8], [r * 0.32, y + r * 0.97], [0, y + r * 1.06]], n, (k) => (k % 2 ? SLATE_2 : SLATE));
    m.tube([a, y + r * 1.0, bb], [a, y + r * 1.06 + 1.4, bb], 0.1, 0.02, 4, WHITE_2);
  };
  dome(0, 0, R, deck + F.drum, 14);

  // Towards the water: the small dome on a round drum, and the one minaret on its square base.
  m.lathe(da, db, [[r2 * 1.12, deck + F.arcade], [r2 * 1.12, deck + F.arcade + 2.6], [r2 * 1.02, deck + F.arcade + 2.6], [r2 * 1.02, deck + F.arcade + 3.1]], 10, WHITE);
  dome(da, db, r2, deck + F.arcade + 3.1, 10);
  m.box(ma - s, ma + s, mb - s, mb + s, deck, by, WHITE, WHITE_2);
  windowRing(m, [ma - s, mb - s, ma + s, mb - s, ma + s, mb + s, ma - s, mb + s], deck + 6.4, deck + 8.6, 2 * s, 0.8, SHADE);
  const prof: [number, number][] = [[1.0, by], [0.9, by + 4.4]];
  for (const [y0, r, y1] of [[4.4, 0.9, 9.8], [9.8, 0.78, 15.2], [15.2, 0.64, 17.0]]) prof.push([r + 0.5, by + y0 + 0.3], [r + 0.5, by + y0 + 0.9], [r - 0.08, by + y0 + 0.9], [r - 0.14, by + y1]);
  m.lathe(ma, mb, prof, 8, WHITE);
  m.lathe(ma, mb, [[0.62, by + 17.0], [0.3, by + 18.2], [0, deck + F.minaretTop]], 8, SLATE_2);
  return m.mesh(ctx, 'floating-mosque');
};

export const buildFloatingMosque: LandmarkBuilder = (args) => (m5Enabled() ? verified(args) : legacy(args));
