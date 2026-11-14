// The Astana (1870) - APPROXIMATE procedural model.
// Mapped (OSM way 353344429): position, outline and orientation of the palace blocks.
// Approximated: the outline is decomposed into rectangular wings (white walls, hipped shingle
// roofs); the crenellated entrance tower is not mapped separately and is placed in the middle of
// the facade that faces the river; heights, openings and colours are estimates.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, sliceRects, sliceExtent, towardWater, windowRow } from './kit.ts';

export const ASTANA_BUILDING = 353344429;

const WHITE = col(0xf3f0e8);
const WHITE_2 = col(0xe2ded2);
const SHINGLE = col(0x5d4c40);
const DARK = col(0x3f3d3a);
const WALK = col(0xb5ae9f);

export const buildAstana: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [ASTANA_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const loc = ringLocal(fp);
  const eave = gTop + 6.0;

  // Plinth following the exact mapped outline, wings as rectangles fitted to it.
  m.walls(loc, g - 0.6, gTop + 0.5, WHITE_2);
  m.cap(loc, [], gTop + 0.5, WALK);
  for (const r of sliceRects(fp)) {
    const la = r.a1 - r.a0, lb = r.b1 - r.b0;
    const short = Math.min(la, lb);
    const mid: [number, number] = [(r.a0 + r.a1) / 2, (r.b0 + r.b1) / 2];
    const small = short < 8;
    const top = small ? eave - 1.6 : eave;
    m.box(r.a0, r.a1, r.b0, r.b1, gTop + 0.5, top, WHITE, null);
    const rise = Math.min(4.6, short * 0.36);
    m.roof(r, top, rise, SHINGLE, { hip: short / 2, alongB: lb > la, over: small ? 0.3 : 0.9 });
    if (small) continue;
    // verandah openings: ground-floor arcade and shuttered upper windows
    for (const [y0, y1, w] of [[gTop + 0.9, gTop + 2.9, 1.5], [gTop + 3.6, gTop + 5.2, 1.2]]) {
      windowRow(m, r.a0, r.b0, r.a1, r.b0, y0, y1, 3.2, w, DARK, mid);
      windowRow(m, r.a0, r.b1, r.a1, r.b1, y0, y1, 3.2, w, DARK, mid);
      windowRow(m, r.a0, r.b0, r.a0, r.b1, y0, y1, 3.2, w, DARK, mid);
      windowRow(m, r.a1, r.b0, r.a1, r.b1, y0, y1, 3.2, w, DARK, mid);
    }
  }

  // Crenellated entrance tower on the river-facing facade (position approximated).
  const front = towardWater(fp, data, ctx, 400, 2.5) ?? [0, 1];
  let ta = 0, tb = 0;
  const s = 2.7;
  if (front[1] !== 0) {
    const e = sliceExtent(loc, 0.01) ?? [-fp.W / 2, fp.W / 2];
    tb = front[1] > 0 ? e[1] + s * 0.4 : e[0] - s * 0.4;
  } else {
    ta = front[0] * (fp.L / 2 + s * 0.4);
    // centre the tower on the facade at that end
    const e = sliceExtent(loc, front[0] * (fp.L / 2 - 1));
    if (e) tb = (e[0] + e[1]) / 2;
  }
  const towerTop = gTop + 13.5;
  m.box(ta - s, ta + s, tb - s, tb + s, g - 0.6, towerTop, WHITE, WALK);
  m.box(ta - s - 0.2, ta + s + 0.2, tb - s - 0.2, tb + s + 0.2, towerTop - 0.8, towerTop - 0.45, WHITE_2);
  m.crenels([ta - s, tb - s, ta + s, tb - s, ta + s, tb + s, ta - s, tb + s], towerTop, 0.9, WHITE, 1.35, 0.4);
  const inside: [number, number] = [ta, tb];
  const faces: [number, number, number, number][] = [[ta - s, tb - s, ta + s, tb - s], [ta + s, tb - s, ta + s, tb + s], [ta + s, tb + s, ta - s, tb + s], [ta - s, tb + s, ta - s, tb - s]];
  for (const f of faces) {
    windowRow(m, f[0], f[1], f[2], f[3], gTop + 0.6, gTop + 3.4, 6, 1.8, DARK, inside); // archway
    windowRow(m, f[0], f[1], f[2], f[3], gTop + 6.2, gTop + 8.0, 2.6, 0.55, DARK, inside);
    windowRow(m, f[0], f[1], f[2], f[3], gTop + 9.8, gTop + 11.6, 2.6, 0.55, DARK, inside);
  }
  return m.mesh(ctx, 'astana');
};
