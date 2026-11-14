// New Sarawak State Legislative Assembly Building (DUN) - APPROXIMATE procedural model.
// Mapped (OSM way 1357531465): position, the star-shaped podium outline, its orientation.
// Published: nine-pointed plan, "payung" (royal umbrella) roof, overall height about 114 m.
// Approximated: tier heights, drum radius, colonnade, roof profile, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, centroid, scaleRing, windowRing, type V3 } from './kit.ts';

export const DUN_BUILDING = 1357531465;

const STONE = col(0xe6dcc3);
const STONE_2 = col(0xefe7d2);
const GLASS = col(0x5f7889);
const GOLD_A = col(0xd2aa3c);
const GOLD_B = col(0xb58d2c);
const SOFFIT = col(0x8f7430);
const DARK = col(0x4c5a66);

/** Published overall height (roof tip), metres. */
const TOTAL_HEIGHT = 114;
const POINTS = 9;

export const buildDun: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [DUN_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const [cx, cz] = centroid(fp.ring);
  const m = new Model().world();
  const g = fp.gMin;
  const k = TOTAL_HEIGHT / 114;

  // Mean / max vertex radius of the mapped outline and the direction of its farthest point,
  // which fixes the rotation of the nine roof ridges.
  let rMean = 0, rMax = 0, phase = 0;
  const n = fp.ring.length / 2;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(fp.ring[i * 2] - cx, fp.ring[i * 2 + 1] - cz);
    rMean += r / n;
    if (r > rMax) { rMax = r; phase = Math.atan2(fp.ring[i * 2 + 1] - cz, fp.ring[i * 2] - cx); }
  }

  // Podium: two tiers following the mapped outline.
  const y1 = g + 8 * k, y2 = g + 16 * k;
  m.walls(fp.ring, g - 0.6, y1, STONE);
  m.cap(fp.ring, [], y1, STONE_2);
  windowRing(m, fp.ring, g + 1.2, y1 - 1.6, 5, 3.2, DARK);
  const tier2 = scaleRing(fp.ring, cx, cz, 0.74);
  m.walls(tier2, y1, y2, STONE_2);
  m.cap(tier2, [], y2, STONE);
  windowRing(m, tier2, y1 + 1.4, y2 - 1.4, 4.5, 3, DARK);

  // Round glazed drum with a colonnade.
  const rd = rMean * 0.4, yE = g + 43 * k;
  m.lathe(cx, cz, [[rd, y2], [rd, yE]], 36, GLASS);
  const COLS = POINTS * 4;
  for (let i = 0; i < COLS; i++) {
    const t = phase + ((i + 0.5) / COLS) * Math.PI * 2;
    const px = cx + Math.cos(t) * (rd + 1.6), pz = cz + Math.sin(t) * (rd + 1.6);
    m.lathe(px, pz, [[0.85, y2], [0.7, yE]], 4, STONE_2, t + Math.PI / 4);
  }
  m.lathe(cx, cz, [[rd + 2.8, yE - 2.4], [rd + 2.8, yE]], 36, STONE_2, 0, true, false);

  // Nine-ridged umbrella roof: star-shaped rings (ridge radius / valley radius), concave profile.
  const R = rMean;
  const rings: [number, number, number, number][] = [
    // ridge radius, ridge y, valley radius, valley y
    [R * 0.66, yE - 3.5 * k, R * 0.5, yE + 1.5 * k],
    [R * 0.47, yE + 9 * k, R * 0.385, yE + 11.5 * k],
    [R * 0.3, yE + 22 * k, R * 0.25, yE + 24 * k],
    [R * 0.165, yE + 36 * k, R * 0.14, yE + 37.5 * k],
    [R * 0.075, yE + 48 * k, R * 0.066, yE + 48.8 * k],
    [R * 0.034, yE + 55 * k, R * 0.034, yE + 55 * k],
  ];
  const ringPts = (r: [number, number, number, number]): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < POINTS * 2; i++) {
      const t = phase + (i / (POINTS * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r[0] : r[2], y = i % 2 === 0 ? r[1] : r[3];
      out.push([cx + Math.cos(t) * rr, y, cz + Math.sin(t) * rr]);
    }
    return out;
  };
  let prev = ringPts(rings[0]);
  // soffit between the eaves and the drum
  for (let i = 0; i < prev.length; i++) {
    const j = (i + 1) % prev.length;
    const t0 = phase + (i / prev.length) * Math.PI * 2, t1 = phase + (j / prev.length) * Math.PI * 2;
    m.poly([prev[i], prev[j], [cx + Math.cos(t1) * rd, yE, cz + Math.sin(t1) * rd], [cx + Math.cos(t0) * rd, yE, cz + Math.sin(t0) * rd]], SOFFIT, [cx, yE + 6, cz]);
  }
  for (let q = 1; q < rings.length; q++) {
    const cur = ringPts(rings[q]);
    const ref: V3 = [cx, (rings[q - 1][1] + rings[q][1]) / 2 - 4, cz];
    for (let i = 0; i < cur.length; i++) {
      const j = (i + 1) % cur.length;
      const c = i % 2 === 0 ? GOLD_A : GOLD_B;
      // two triangles per facet (the star facets are not planar)
      m.poly([prev[i], prev[j], cur[j]], c, ref);
      m.poly([prev[i], cur[j], cur[i]], c, ref);
    }
    prev = cur;
  }
  // Spire
  const ys = yE + 55 * k;
  m.lathe(cx, cz, [[R * 0.034, ys], [R * 0.05, ys + 1.2], [R * 0.02, ys + 4], [0.5, ys + 9], [0, g + TOTAL_HEIGHT]], 9, GOLD_A, phase);
  return m.mesh(ctx, 'dun');
};
