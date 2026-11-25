// Kuching Old Courthouse (1874) - APPROXIMATE procedural model.
// Mapped (OSM relation 10459393): position, outline of the single-storey blocks, the courtyard.
// Approximated: verandah openings, hipped belian-shingle roofs (built as an inset "truncated hip"
// that follows the mapped outline), the clock tower (1883) placed at the middle of the longest
// outer wall because it is not mapped separately, heights, colours.
import type * as THREE from 'three';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { m5Enabled } from '../district/m5.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, insetRing, windowRing, type V3 } from './kit.ts';

export const OLD_COURTHOUSE_BUILDING = -10459393;

const WHITE = col(0xf1ede2);
const SHINGLE = col(0x62503f);
const SHINGLE_2 = col(0x574638);
const DARK = col(0x4a3f36);
// N1-M5: the photographs show weathered belian shingle, a dark grey-brown, not the earlier chestnut.
const SHINGLE_M5 = col(0x4f4842), SHINGLE_M5_2 = col(0x46403b);


/** The verified form of the clock tower (metres): half width, porch height, upper storey, cupola. */
export const CLOCK_TOWER = { half: 2.5, porch: 3.7, upper: 4.4, columns: 6, cupola: 1.25 };
const STEP = col(0xb9b4a8);
const LOUVRE = col(0x8f918d);
const CLOCK = col(0xf4f1e6);

/**
 * N1-M5 (hero place 4), VERIFIED FORM from two Commons photographs (Mattun0211, "KuchingOldCourtHouse.JPG", CC0, and
 * Yeo Jiun Tzen, "Old Court House Complex, Kuching 01.jpg", CC BY-SA 4.0): white single-storey ranges under big
 * hipped roofs of dark shingle, round white columns along the verandahs, and the clock tower (1883): a white upper
 * storey carried on six round columns over an open porch with steps, lattice windows with a small balcony, a clock
 * in a shaped parapet, a louvred cupola under a little pyramid roof with a flagpole.
 * APPROXIMATE: every dimension; where the tower stands (it is not mapped: the middle of the longest outer wall, as
 * before); the column spacing; that every wall of the outline carries a verandah.
 */
function verifiedCourthouse(m: Model, loc: number[], holes: number[][], inner: number[], g: number, gTop: number, eave: number): void {
  // Verandah columns: round, white, between the dark openings, a little proud of the wall.
  const colonnade = (ring: number[], inward: boolean) => {
    const n = ring.length / 2;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i, i++) area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    const s = (area > 0 ? 1 : -1) * (inward ? -1 : 1);
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const a0 = ring[j * 2], b0 = ring[j * 2 + 1], a1 = ring[i * 2], b1 = ring[i * 2 + 1], l = Math.hypot(a1 - a0, b1 - b0);
      if (l < 3.3 + 1.7 + 0.6) continue;
      const da = (a1 - a0) / l, db = (b1 - b0) / l, na = db * s, nb = -da * s, count = Math.max(1, Math.floor(l / 3.3)), step = l / count;
      for (let k = 0; k <= count; k++) {
        const t = Math.min(l - 0.3, Math.max(0.3, k * step)), a = a0 + da * t + na * 0.28, b = b0 + db * t + nb * 0.28;
        m.tube([a, g - 0.3, b], [a, eave - 0.25, b], 0.23, 0.2, 6, WHITE);
      }
    }
  };
  colonnade(loc, false);
  for (const h of holes) colonnade(h, true);

  // Clock tower: in front of the middle of the longest outer wall.
  const n = loc.length / 2;
  let bi = 0, bl = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const l = Math.hypot(loc[i * 2] - loc[j * 2], loc[i * 2 + 1] - loc[j * 2 + 1]);
    if (l > bl) { bl = l; bi = i; }
  }
  const bj = (bi + n - 1) % n;
  const ma = (loc[bi * 2] + loc[bj * 2]) / 2, mb = (loc[bi * 2 + 1] + loc[bj * 2 + 1]) / 2;
  const da = (loc[bi * 2] - loc[bj * 2]) / bl, db = (loc[bi * 2 + 1] - loc[bj * 2 + 1]) / bl;
  // outward = away from the roof's inner line
  let na = -db, nb = da;
  if (na * ((inner[bi * 2] + inner[bj * 2]) / 2 - ma) + nb * ((inner[bi * 2 + 1] + inner[bj * 2 + 1]) / 2 - mb) > 0) { na = -na; nb = -nb; }
  const S = CLOCK_TOWER.half, D = S * 0.9; // half width along the wall, half depth
  const ca = ma + na * (D - 0.6), cb = mb + nb * (D - 0.6);
  const P = (u: number, v: number, y: number): V3 => [ca + da * u + na * v, y, cb + db * u + nb * v];
  const quad = (p: V3[], c: THREE.Color, ref: V3) => m.poly(p, c, ref);
  const yP = gTop + CLOCK_TOWER.porch, yT = yP + CLOCK_TOWER.upper, mid = P(0, 0, (yP + yT) / 2);
  // steps up to the porch, then six columns: four across the front, two at the back
  for (let k = 0; k < 3; k++) {
    const v0 = D + 0.35 * (3 - k), y1 = g - 0.3 + (gTop + 0.3 - (g - 0.3)) * ((k + 1) / 3);
    quad([P(-S * 0.8, v0, y1), P(S * 0.8, v0, y1), P(S * 0.8, D - 0.2, y1), P(-S * 0.8, D - 0.2, y1)], STEP, P(0, 0, y1 - 2));
    quad([P(-S * 0.8, v0, g - 0.6), P(S * 0.8, v0, g - 0.6), P(S * 0.8, v0, y1), P(-S * 0.8, v0, y1)], STEP, P(0, 0, y1));
  }
  for (const [u, v] of [[-1, 1], [-0.34, 1], [0.34, 1], [1, 1], [-1, -0.2], [1, -0.2]]) {
    const p = P(u * (S - 0.3), v * (D - 0.3), 0);
    m.tube([p[0], g - 0.3, p[2]], [p[0], yP, p[2]], 0.27, 0.23, 8, WHITE);
  }
  // upper storey: four walls, a floor seen from below, a flat top
  const C: [number, number][] = [[-S, -D], [S, -D], [S, D], [-S, D]];
  for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4]; quad([P(p[0], p[1], yP), P(q[0], q[1], yP), P(q[0], q[1], yT), P(p[0], p[1], yT)], WHITE, mid); }
  quad(C.map(([u, v]) => P(u, v, yP)), WHITE, mid);
  quad(C.map(([u, v]) => P(u, v, yT)), WHITE, mid);
  // cornice band, lattice windows (front and sides), the small balcony
  for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4], e = 1.05; quad([P(p[0] * e, p[1] * e, yT - 0.3), P(q[0] * e, q[1] * e, yT - 0.3), P(q[0] * e, q[1] * e, yT - 0.08), P(p[0] * e, p[1] * e, yT - 0.08)], WHITE, mid); }
  const f = D + 0.05;
  quad([P(-0.7, f, yP + 1.3), P(0.7, f, yP + 1.3), P(0.7, f, yP + 2.7), P(-0.7, f, yP + 2.7)], DARK, mid);
  quad([P(-0.06, f + 0.02, yP + 1.3), P(0.06, f + 0.02, yP + 1.3), P(0.06, f + 0.02, yP + 2.7), P(-0.06, f + 0.02, yP + 2.7)], WHITE, mid);
  quad([P(-0.95, f + 0.04, yP + 2.75), P(0.95, f + 0.04, yP + 2.75), P(0, f + 0.04, yP + 3.3)], WHITE, mid); // pediment over the window
  for (const sd of [-1, 1]) quad([P(sd * (S + 0.05), -0.45, yP + 1.4), P(sd * (S + 0.05), 0.45, yP + 1.4), P(sd * (S + 0.05), 0.45, yP + 2.8), P(sd * (S + 0.05), -0.45, yP + 2.8)], DARK, mid);
  quad([P(-0.9, f, yP + 1.08), P(0.9, f, yP + 1.08), P(0.9, f + 0.5, yP + 1.08), P(-0.9, f + 0.5, yP + 1.08)], WHITE, P(0, 0, yP));
  quad([P(-0.9, f + 0.5, yP + 1.0), P(0.9, f + 0.5, yP + 1.0), P(0.9, f + 0.5, yP + 1.6), P(-0.9, f + 0.5, yP + 1.6)], WHITE, P(0, 0, yP + 1.3));
  // shaped parapet with the clock: a raised middle piece, a white dial in a dark ring, two hands
  quad([P(-1.45, f - 0.1, yT), P(1.45, f - 0.1, yT), P(1.0, f - 0.1, yT + 1.3), P(-1.0, f - 0.1, yT + 1.3)], WHITE, P(0, 0, yT));
  quad([P(-1.45, f - 0.5, yT), P(1.45, f - 0.5, yT), P(1.0, f - 0.5, yT + 1.3), P(-1.0, f - 0.5, yT + 1.3)], WHITE, P(0, D * 2, yT));
  const dial = (r: number, off: number, c: THREE.Color) => {
    const pts: V3[] = [];
    for (let k = 0; k < 10; k++) { const u = (k / 10) * Math.PI * 2; pts.push(P(Math.cos(u) * r, f - 0.1 + off, yT + 0.66 + Math.sin(u) * r)); }
    m.poly(pts, c, mid);
  };
  dial(0.54, 0.03, DARK); dial(0.46, 0.05, CLOCK);
  quad([P(-0.03, f - 0.03, yT + 0.66), P(0.03, f - 0.03, yT + 0.66), P(0.03, f - 0.03, yT + 1.02), P(-0.03, f - 0.03, yT + 1.02)], DARK, mid);
  quad([P(0, f - 0.03, yT + 0.63), P(0.27, f - 0.03, yT + 0.76), P(0.25, f - 0.03, yT + 0.81), P(0, f - 0.03, yT + 0.69)], DARK, mid);
  // louvred cupola, pyramid roof, flagpole
  const q = CLOCK_TOWER.cupola / 2, yC = yT + CLOCK_TOWER.cupola + 0.2;
  const K: [number, number][] = [[-q, -q - 0.3], [q, -q - 0.3], [q, q - 0.3], [-q, q - 0.3]];
  for (let i = 0; i < 4; i++) { const p = K[i], r = K[(i + 1) % 4]; quad([P(p[0], p[1], yT), P(r[0], r[1], yT), P(r[0], r[1], yC), P(p[0], p[1], yC)], LOUVRE, P(0, -0.3, yT + 0.5)); }
  for (let i = 0; i < 4; i++) { const p = K[i], r = K[(i + 1) % 4], e = 1.35; m.poly([P(p[0] * e, (p[1] + 0.3) * e - 0.3, yC), P(r[0] * e, (r[1] + 0.3) * e - 0.3, yC), P(0, -0.3, yC + 0.7)], SHINGLE_M5, P(0, -0.3, yC - 1)); }
  { const p = P(0, -0.3, 0); m.tube([p[0], yC + 0.6, p[2]], [p[0], yC + 2.6, p[2]], 0.03, 0.02, 4, WHITE); }
}

export const buildOldCourthouse: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [OLD_COURTHOUSE_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp), holes = fp.holes.map((h) => ringLocal(fp, h));
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const eave = gTop + Math.max(4.2, fp.h);
  const INSET = 3.4, RISE = 2.7;
  const sh = m5Enabled() ? SHINGLE_M5 : SHINGLE, sh2 = m5Enabled() ? SHINGLE_M5_2 : SHINGLE_2;

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
      m.poly([p[0], p[1], p[2]], i % 2 ? sh : sh2, ref);
      m.poly([p[0], p[2], p[3]], i % 2 ? sh : sh2, ref);
    }
  };
  const inner = insetRing(loc, INSET);
  slope(loc, inner, insetRing(loc, -0.7));
  const innerHoles = holes.map((h) => insetRing(h, -INSET));
  holes.forEach((h, i) => slope(h, innerHoles[i], insetRing(h, 0.7)));
  m.cap(inner, innerHoles, eave + RISE, sh);

  // N1-M5: the verified form of the verandahs and the clock tower (?m5=0 keeps the earlier plain tower below).
  if (m5Enabled()) { verifiedCourthouse(m, loc, holes, inner, g, gTop, eave); return m.mesh(ctx, 'old-courthouse'); }
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
