// Kuching Old Courthouse (1874) - APPROXIMATE procedural model.
// Mapped (OSM relation 10459393): position, outline of the single-storey blocks, the courtyard.
// Approximated: verandah openings, hipped belian-shingle roofs (built as an inset "truncated hip"
// that follows the mapped outline), the clock tower (1883) placed at the middle of the longest
// outer wall because it is not mapped separately, heights, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, insetRing, windowRing, type V3 } from './kit.ts';

export const OLD_COURTHOUSE_BUILDING = -10459393;

const WHITE = col(0xf1ede2);
const SHINGLE = col(0x62503f);
const SHINGLE_2 = col(0x574638);
const DARK = col(0x4a3f36);

export const buildOldCourthouse: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [OLD_COURTHOUSE_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp), holes = fp.holes.map((h) => ringLocal(fp, h));
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const eave = gTop + Math.max(4.2, fp.h);
  const INSET = 3.4, RISE = 2.7;

  m.walls(loc, g - 0.6, eave, WHITE);
  for (const h of holes) m.walls(h, g - 0.6, eave, WHITE, true);
  windowRing(m, loc, gTop + 0.5, gTop + 3.1, 3.3, 1.7, DARK);
  for (const h of holes) windowRing(m, h, gTop + 0.5, gTop + 3.1, 3.3, 1.7, DARK, true);

  // Roof: sloping planes from every wall up to an inset outline, flat on top.
  const slope = (ring: number[], inner: number[], over: number[]) => {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const p: V3[] = [[over[j * 2], eave - 0.35, over[j * 2 + 1]], [over[i * 2], eave - 0.35, over[i * 2 + 1]], [inner[i * 2], eave + RISE, inner[i * 2 + 1]], [inner[j * 2], eave + RISE, inner[j * 2 + 1]]];
      const ref: V3 = [(inner[i * 2] + inner[j * 2]) / 2, eave - 3, (inner[i * 2 + 1] + inner[j * 2 + 1]) / 2];
      m.poly([p[0], p[1], p[2]], i % 2 ? SHINGLE : SHINGLE_2, ref);
      m.poly([p[0], p[2], p[3]], i % 2 ? SHINGLE : SHINGLE_2, ref);
    }
  };
  const inner = insetRing(loc, INSET);
  slope(loc, inner, insetRing(loc, -0.7));
  const innerHoles = holes.map((h) => insetRing(h, -INSET));
  holes.forEach((h, i) => slope(h, innerHoles[i], insetRing(h, 0.7)));
  m.cap(inner, innerHoles, eave + RISE, SHINGLE);

  // Clock tower on the longest outer wall (approximate position).
  const n = loc.length / 2;
  let bi = 0, bl = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const l = Math.hypot(loc[i * 2] - loc[j * 2], loc[i * 2 + 1] - loc[j * 2 + 1]);
    if (l > bl) { bl = l; bi = i; }
  }
  const bj = (bi + n - 1) % n;
  const ta = (inner[bi * 2] + inner[bj * 2] + loc[bi * 2] + loc[bj * 2]) / 4, tb = (inner[bi * 2 + 1] + inner[bj * 2 + 1] + loc[bi * 2 + 1] + loc[bj * 2 + 1]) / 4;
  const s = 1.7, tTop = eave + 6.2;
  m.box(ta - s, ta + s, tb - s, tb + s, eave, tTop, WHITE, null);
  windowRing(m, [ta - s, tb - s, ta + s, tb - s, ta + s, tb + s, ta - s, tb + s], tTop - 2.2, tTop - 0.7, 2 * s, 1.3, DARK);
  m.roof({ a0: ta - s, a1: ta + s, b0: tb - s, b1: tb + s }, tTop, 2.6, SHINGLE, { hip: s, over: 0.35 });
  return m.mesh(ctx, 'old-courthouse');
};
