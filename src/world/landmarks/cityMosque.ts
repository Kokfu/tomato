// Kuching City Mosque (Masjid Bandaraya Kuching, 1968; OSM way 233622270) - procedural model, N1-M5 hero place 6.
// Mapped: position and outline (a large hall with a round projection at its south end and stepped sides).
// VERIFIED FORM from two Commons photographs (Mx. Granger, "Kuching Town Mosque.jpg", CC0; Wee Hong, "Masjid
// Bandaraya Kuching.jpg", CC BY-SA 4.0; docs/night/m5-city-mosque-floating-mosque.md): pink walls with pilasters
// that rise through a crenellated parapet, two storeys of dark windows under gold bonnets, one large ribbed gold
// onion dome on a drum, smaller gold onion domes round it, round pink minarets with an open top stage under a gold
// cap, small gold-capped turrets along the parapet, an entrance under a flat canopy on slender columns.
// APPROXIMATE: every dimension; where on the mapped outline the domes, minarets and turrets stand (the photographs
// give their number and order, not a plan); that the round projection of the outline is the entrance (it faces the
// car park in the front photograph); the bay spacing; the faces no photograph shows.
// Registered only with the m5 flag on (landmarks/index.ts): `?m5=0` keeps the generic hall of N1-M3.
import type * as THREE from 'three';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, centroid, findBuilding, fitFootprint, insetRing, onionProfile, pointInRing, ringLocal, type V3 } from './kit.ts';

export const CITY_MOSQUE_BUILDING = 233622270;
/** Verified counts and estimated heights (metres above the upper ground level). */
export const CITY_MOSQUE = { wall: 10.5, storey: 5.2, domeR: 6.4, smallDomes: 4, minarets: 4, minaretTop: 24.5, bay: 4.4 };

const PINK = col(0xf0b4ae), PINK_2 = col(0xe59f9a), PINK_3 = col(0xf6cdc6), ROOF = col(0xc9b4ae);
const GOLD = col(0xd8ab32), GOLD_2 = col(0xbf9226), DARK = col(0x2c3338), CREAM = col(0xefe6d0), STEP = col(0xb9b3a8), CANOPY = col(0xd98f8b);

/** Vertices of the outline that belong to its round projection: both edges at the vertex are short. */
export function apseOf(loc: number[]): { a: number; b: number; r: number; idx: number[] } | null {
  const n = loc.length / 2, len = (i: number) => { const j = (i + 1) % n; return Math.hypot(loc[j * 2] - loc[i * 2], loc[j * 2 + 1] - loc[i * 2 + 1]); };
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (len(i) < 4.7 && len((i + n - 1) % n) < 4.7) idx.push(i);
  if (idx.length < 4) return null;
  let a = 0, b = 0;
  for (const i of idx) { a += loc[i * 2]; b += loc[i * 2 + 1]; }
  a /= idx.length; b /= idx.length;
  let r = 0;
  for (const i of idx) r += Math.hypot(loc[i * 2] - a, loc[i * 2 + 1] - b);
  return { a, b, r: r / idx.length, idx };
}

export const buildCityMosque: LandmarkBuilder = ({ data, ctx }) => {
  const bld = findBuilding(data, [CITY_MOSQUE_BUILDING]);
  if (!bld) return null;
  const fp = fitFootprint(bld, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp), n = loc.length / 2;
  const g = fp.gMin, gTop = Math.max(g, fp.gMean), top = gTop + CITY_MOSQUE.wall;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) area += loc[j * 2] * loc[i * 2 + 1] - loc[i * 2] * loc[j * 2 + 1];
  const sg = area > 0 ? 1 : -1;
  const [ca, cb] = centroid(loc);
  const apse = apseOf(loc);
  const inApse = (i: number) => !!apse?.idx.includes(i);

  m.walls(loc, g - 0.8, top, PINK);
  m.cap(loc, [], top, ROOF);
  const R = Math.min(CITY_MOSQUE.domeR, Math.min(fp.L, fp.W) * 0.17), dy = top + 3.2;
  const d = R * 1.55;
  const used: number[] = [];
  for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let best = -1, bv = -Infinity;
    for (let i = 0; i < n; i++) { if (inApse(i)) continue; const v = sa * loc[i * 2] / fp.L + sb * loc[i * 2 + 1] / fp.W; if (v > bv) { bv = v; best = i; } }
    if (best >= 0 && !used.includes(best)) used.push(best);
  }

  // N2-M0b: distant ('low') chunk detail keeps the pink hall, gold onion domes and four minarets (~280 tris vs 5.7k).
  if (ctx.detail !== 'high') {
    m.lathe(ca, cb, [[R * 1.05, top], [R * 0.98, dy]], 8, PINK, 0, false, false);
    m.lathe(ca, cb, [[R * 1.04, dy], [R * 1.12, dy + R * 0.5], [R * 0.62, dy + R * 1.15], [0, dy + R * 1.65]], 8, GOLD);
    for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = ca + sa * d, b = cb + sb * d;
      if (pointInRing(a, b, loc)) m.lathe(a, b, [[2.3, top], [1.6, top + 2.8], [0, top + 4.8]], 6, GOLD);
    }
    for (const best of used) {
      const va = loc[best * 2], vb = loc[best * 2 + 1], dl = Math.hypot(ca - va, cb - vb) || 1, a = va + ((ca - va) / dl) * 1.2, b = vb + ((cb - vb) / dl) * 1.2;
      const y = gTop + CITY_MOSQUE.minaretTop - 3.9;
      m.lathe(a, b, [[1.7, g - 0.8], [1.35, y + 2.3]], 6, PINK, 0, false, false);
      m.lathe(a, b, [[1.35, y + 2.3], [0.85, y + 3.2], [0, y + 4.4]], 6, GOLD);
    }
    if (apse) m.lathe(apse.a, apse.b, [[apse.r * 0.9, top + 0.1], [apse.r * 0.5, top + apse.r * 0.28], [0, top + apse.r * 0.4]], 6, GOLD);
    return m.mesh(ctx, 'city-mosque');
  }

  m.walls(insetRing(loc, -0.08), gTop + CITY_MOSQUE.storey, gTop + CITY_MOSQUE.storey + 0.22, PINK_2);
  m.walls(insetRing(loc, -0.1), top - 0.3, top, PINK_3);
  m.crenels(loc, top, 0.6, PINK_3, 2.5, 0.3);

  // Bays between pilasters, edge by edge: a window under a gold bonnet on each storey.
  const bonnet = (P: (s: number, y: number, off: number) => V3, s: number, y: number, w: number) => {
    const L = P(s - w / 2, y, 0.04), R = P(s + w / 2, y, 0.04), FL = P(s - w * 0.42, y - 0.12, 0.75), FR = P(s + w * 0.42, y - 0.12, 0.75), T = P(s, y + 0.95, 0.04), ref = P(s, y, -1);
    m.poly([L, FL, T], GOLD_2, ref); m.poly([FL, FR, T], GOLD, ref); m.poly([FR, R, T], GOLD_2, ref);
  };
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const a0 = loc[j * 2], b0 = loc[j * 2 + 1], a1 = loc[i * 2], b1 = loc[i * 2 + 1], l = Math.hypot(a1 - a0, b1 - b0);
    if (l < 6.5 || (inApse(i) && inApse(j))) continue;
    const da = (a1 - a0) / l, db = (b1 - b0) / l, na = db * sg, nb = -da * sg;
    const P = (s: number, y: number, off: number): V3 => [a0 + da * s + na * off, y, b0 + db * s + nb * off];
    const pane = (s0: number, s1: number, y0: number, y1: number, c: THREE.Color, off: number) => m.poly([P(s0, y0, off), P(s1, y0, off), P(s1, y1, off), P(s0, y1, off)], c, P((s0 + s1) / 2, y0, -1));
    const bays = Math.max(1, Math.round(l / CITY_MOSQUE.bay)), w = l / bays;
    for (let k = 0; k <= bays; k++) {
      // pilaster: a strip proud of the wall that rises through the parapet
      const s = Math.min(l - 0.28, Math.max(0.28, k * w));
      pane(s - 0.28, s + 0.28, g - 0.8, top + 1.0, PINK_2, 0.14);
    }
    for (let k = 0; k < bays; k++) {
      const s = (k + 0.5) * w, ww = Math.min(2.2, w - 1.3);
      for (const y of [gTop + 1.1, gTop + CITY_MOSQUE.storey + 0.9]) {
        pane(s - ww / 2, s + ww / 2, y, y + 2.3, DARK, 0.05);
        pane(s - ww / 2, s + ww / 2, y + 0.95, y + 1.05, PINK_3, 0.07);
        bonnet(P, s, y + 2.3, ww + 0.3);
      }
    }
  }

  // The large dome on its drum, over the middle of the hall.
  m.lathe(ca, cb, [[R * 1.25, top], [R * 1.25, top + 0.9], [R * 0.98, top + 0.9], [R * 0.98, dy]], 12, PINK, 0, false, false);
  for (let k = 0; k < 12; k++) {
    const u = ((k + 0.5) / 12) * Math.PI * 2, r = R * 0.98 * Math.cos(Math.PI / 12) + 0.04, t: [number, number] = [-Math.sin(u), Math.cos(u)];
    const q = (d: number, y: number): V3 => [ca + Math.cos(u) * r + t[0] * d, y, cb + Math.sin(u) * r + t[1] * d];
    m.poly([q(-0.5, top + 1.3), q(0.5, top + 1.3), q(0.5, dy - 0.5), q(-0.5, dy - 0.5)], DARK, [ca, top + 2, cb]);
  }
  m.lathe(ca, cb, onionProfile(R, dy, 1.14, 1.5), 12, (k) => (k % 2 ? GOLD : GOLD_2));
  const tip = dy + R * 1.22 * 1.5;
  m.tube([ca, tip - 0.3, cb], [ca, tip + 2.2, cb], 0.16, 0.03, 4, GOLD);
  m.lathe(ca, cb, [[0, tip + 0.5], [0.42, tip + 0.8], [0, tip + 1.1]], 5, GOLD);

  // Four smaller gold domes on square kiosks round it.
  for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = ca + sa * d, b = cb + sb * d;
    if (!pointInRing(a, b, loc)) continue;
    m.box(a - 2.1, a + 2.1, b - 2.1, b + 2.1, top, top + 2.4, PINK, ROOF);
    m.lathe(a, b, [[1.9, top + 2.4], [1.9, top + 3.1]], 8, PINK);
    m.lathe(a, b, onionProfile(2.3, top + 3.1, 1.14, 1.45), 8, (k) => (k % 2 ? GOLD : GOLD_2));
    m.tube([a, top + 7.0, b], [a, top + 8.4, b], 0.09, 0.02, 4, GOLD);
  }

  // Minarets at the four outer corners of the outline (the extreme vertices along its diagonals), a little inside.
  for (const best of used) {
    const va = loc[best * 2], vb = loc[best * 2 + 1], dl = Math.hypot(ca - va, cb - vb) || 1, a = va + ((ca - va) / dl) * 1.2, b = vb + ((cb - vb) / dl) * 1.2;
    const y = gTop + CITY_MOSQUE.minaretTop - 3.9;
    m.lathe(a, b, [[1.75, g - 0.8], [1.6, top + 0.8], [1.35, y - 0.5], [1.9, y - 0.1], [1.9, y + 0.45], [1.3, y + 0.45]], 8, (k) => (k === 3 ? PINK_3 : PINK), 0, false, true);
    for (let k = 0; k < 4; k++) { const u = (k / 4) * Math.PI * 2; m.tube([a + Math.cos(u) * 1.1, y + 0.45, b + Math.sin(u) * 1.1], [a + Math.cos(u) * 1.1, y + 2.0, b + Math.sin(u) * 1.1], 0.14, 0.14, 4, PINK_3); }
    m.lathe(a, b, [[1.5, y + 2.0], [1.5, y + 2.3], [1.2, y + 2.3]], 8, PINK_3, 0, true, true);
    m.lathe(a, b, onionProfile(1.3, y + 2.3, 1.14, 1.3), 8, (k) => (k % 2 ? GOLD : GOLD_2));
    m.tube([a, y + 4.2, b], [a, y + 5.4, b], 0.07, 0.02, 4, GOLD);
  }
  // Small gold-capped turrets at the other corners of the parapet.
  for (let i = 0; i < n; i++) {
    if (inApse(i) || used.includes(i)) continue;
    const a = loc[i * 2], b = loc[i * 2 + 1];
    if (used.some((u) => Math.hypot(loc[u * 2] - a, loc[u * 2 + 1] - b) < 8)) continue;
    m.box(a - 0.5, a + 0.5, b - 0.5, b + 0.5, top - 0.2, top + 1.7, PINK_2);
    m.lathe(a, b, onionProfile(0.62, top + 1.7, 1.14, 1.3), 5, GOLD);
  }

  // The entrance at the round projection: a shallow gold dome over it, a flat canopy on slender columns, steps.
  if (apse) {
    const ol = Math.hypot(apse.a - ca, apse.b - cb) || 1, oa = (apse.a - ca) / ol, ob = (apse.b - cb) / ol;
    m.lathe(apse.a, apse.b, [[apse.r * 0.9, top + 0.1], [apse.r * 0.8, top + apse.r * 0.16], [apse.r * 0.58, top + apse.r * 0.29], [apse.r * 0.3, top + apse.r * 0.37], [0, top + apse.r * 0.4]], 10, (k) => (k % 2 ? GOLD : GOLD_2));
    const E = (out: number, side: number, y: number): V3 => [apse.a + oa * out - ob * side, y, apse.b + ob * out + oa * side];
    const o0 = apse.r - 0.3, o1 = apse.r + 5.2, hw = 6.2, cy = gTop + 4.3, ref = E((o0 + o1) / 2, 0, cy + 0.2);
    m.poly([E(o0, -hw, cy + 0.45), E(o1, -hw, cy + 0.45), E(o1, hw, cy + 0.45), E(o0, hw, cy + 0.45)], CANOPY);
    m.poly([E(o0, -hw, cy), E(o1, -hw, cy), E(o1, hw, cy), E(o0, hw, cy)], CREAM, E((o0 + o1) / 2, 0, cy + 1));
    m.poly([E(o1, -hw, cy), E(o1, hw, cy), E(o1, hw, cy + 0.45), E(o1, -hw, cy + 0.45)], CANOPY, ref);
    for (const s of [-1, 1]) m.poly([E(o0, s * hw, cy), E(o1, s * hw, cy), E(o1, s * hw, cy + 0.45), E(o0, s * hw, cy + 0.45)], CANOPY, ref);
    for (const s of [-5.6, -1.9, 1.9, 5.6]) for (const o of [o1 - 0.5, o1 - 2.9]) m.tube(E(o, s, g - 0.3), E(o, s, cy), 0.17, 0.15, 4, CREAM);
    for (let k = 0; k < 3; k++) {
      const y = gTop + 0.45 - k * 0.15, a0 = o0, a1 = o1 - 0.9 + k * 0.45, h = hw - 0.4 + k * 0.3;
      m.poly([E(a0, -h, y), E(a1, -h, y), E(a1, h, y), E(a0, h, y)], STEP);
      m.poly([E(a1, -h, g - 0.5), E(a1, h, g - 0.5), E(a1, h, y), E(a1, -h, y)], STEP, E(a0, 0, y));
      for (const s of [-1, 1]) m.poly([E(a0, s * h, g - 0.5), E(a1, s * h, g - 0.5), E(a1, s * h, y), E(a0, s * h, y)], STEP, E(a0, 0, y));
    }
    // the doorway
    m.poly([E(apse.r + 0.06, -2.2, gTop + 0.45), E(apse.r + 0.06, 2.2, gTop + 0.45), E(apse.r + 0.06, 2.2, gTop + 3.6), E(apse.r + 0.06, -2.2, gTop + 3.6)], DARK, E(0, 0, gTop + 2));
  }
  return m.mesh(ctx, 'city-mosque');
};
