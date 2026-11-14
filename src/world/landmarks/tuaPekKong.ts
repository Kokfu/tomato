// Tua Pek Kong Temple (Siew San Teng) - APPROXIMATE procedural model.
// Mapped (OSM way 269781302): the temple plot (tagged amenity=place_of_worship; no separate
// building outline exists in OSM, so the data pipeline uses the plot as an approximate footprint).
// Approximated: everything else - terrace, main hall behind an open front pavilion, curved tiled
// roofs with upturned ridges, red columns, colours. The front is the end that faces the river.
import * as THREE from 'three';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, towardWater, windowRow, type V3 } from './kit.ts';

export const TUA_PEK_KONG_BUILDING = 269781302;

const STONE = col(0xbdb6a8);
const RED = col(0xb5302a);
const RED_DARK = col(0x8e2420);
const CREAM = col(0xefe2c4);
const TILE = col(0xb65a30);
const TILE_2 = col(0xa24e2a);
const RIDGE = col(0x2f7358);
const GOLD = col(0xd9b23c);
const DARK = col(0x33211c);

/**
 * Curved Chinese roof. The ridge runs along local b (parallel to the facade), centred on
 * (ca, cb). halfS = half ridge length, halfT = half span across the ridge (both to the walls).
 */
function curvedRoof(m: Model, ca: number, cb: number, halfS: number, halfT: number, yEave: number, rise: number, over: number, gable: THREE.Color): void {
  const N = 8;
  const S = halfS + over, T = halfT + over;
  const line = (u: number, tt: number): V3 => {
    // tt: -1 eave, -0.5 mid, 0 ridge, 0.5 mid, 1 eave
    const curl = Math.abs(u) ** 2.4;
    const at = Math.abs(tt);
    const y = at < 0.01 ? yEave + rise + curl * rise * 0.42 : at < 0.75 ? yEave + rise * 0.36 + curl * rise * 0.3 : yEave - 0.25 + curl * rise * 0.38;
    return [ca + tt * T, y, cb + u * S];
  };
  const ts = [-1, -0.5, 0, 0.5, 1];
  for (let i = 0; i < N; i++) {
    const u0 = -1 + (2 * i) / N, u1 = -1 + (2 * (i + 1)) / N;
    const ref: V3 = [ca, yEave - 2, cb + ((u0 + u1) / 2) * S];
    for (let k = 0; k < 4; k++) {
      const c = (i + k) % 2 ? TILE : TILE_2;
      const p00 = line(u0, ts[k]), p01 = line(u1, ts[k]), p10 = line(u0, ts[k + 1]), p11 = line(u1, ts[k + 1]);
      m.poly([p00, p01, p11], c, ref);
      m.poly([p00, p11, p10], c, ref);
    }
    // ridge beam
    const r0 = line(u0, 0), r1 = line(u1, 0);
    m.poly([[r0[0] - 0.22, r0[1] - 0.05, r0[2]], [r1[0] - 0.22, r1[1] - 0.05, r1[2]], [r1[0], r1[1] + 0.55, r1[2]], [r0[0], r0[1] + 0.55, r0[2]]], RIDGE, ref);
    m.poly([[r0[0] + 0.22, r0[1] - 0.05, r0[2]], [r1[0] + 0.22, r1[1] - 0.05, r1[2]], [r1[0], r1[1] + 0.55, r1[2]], [r0[0], r0[1] + 0.55, r0[2]]], RIDGE, ref);
  }
  for (const u of [-1, 1]) {
    // gable wall under the roof end, and the upswept ridge tip
    const gu = (halfS / S) * u;
    const pts = ts.map((t) => { const p = line(gu, t * (halfT / T)); return [p[0], p[1] - 0.05, p[2]] as V3; });
    m.poly([[ca - halfT, yEave - 0.3, cb + gu * S], pts[1], pts[2], pts[3], [ca + halfT, yEave - 0.3, cb + gu * S]], gable, [ca, yEave, cb]);
    const tip = line(u, 0);
    m.tube([tip[0], tip[1] + 0.3, tip[2] - u * 0.3], [tip[0], tip[1] + 1.5, tip[2] + u * 0.9], 0.2, 0, 4, GOLD);
  }
  // central ridge ornament
  const mid = line(0, 0);
  m.lathe(mid[0], mid[2], [[0.32, mid[1] + 0.5], [0.42, mid[1] + 0.85], [0, mid[1] + 1.5]], 6, GOLD);
}

export const buildTuaPekKong: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [TUA_PEK_KONG_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  // Front = the short end facing the river (falls back to +a).
  const front = towardWater(fp, data, ctx);
  const flip = front && front[0] < 0;
  const m = new Model().frame(flip ? { cx: fp.cx, cz: fp.cz, ux: -fp.ux, uz: -fp.uz } : fp);
  const L = fp.L, W = fp.W;
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const floor = gTop + 1.0;

  // Terrace filling the mapped plot, with front steps.
  m.box(-L / 2, L / 2 - 2.4, -W / 2, W / 2, g - 0.6, floor, STONE);
  m.box(L / 2 - 2.4, L / 2, -W / 2, -W * 0.22, g - 0.6, floor, STONE);
  m.box(L / 2 - 2.4, L / 2, W * 0.22, W / 2, g - 0.6, floor, STONE);
  for (let i = 0; i < 3; i++) m.box(L / 2 - 2.4 + i * 0.8, L / 2 - 1.6 + i * 0.8, -W * 0.22, W * 0.22, g - 0.6, floor - (i + 1) * (floor - gTop) * 0.25, STONE);
  m.box(L / 2 - 0.3, L / 2, -W / 2, -W * 0.22, floor, floor + 0.9, CREAM);
  m.box(L / 2 - 0.3, L / 2, W * 0.22, W / 2, floor, floor + 0.9, CREAM);
  for (const s of [-1, 1]) m.box(-L / 2, L / 2 - 0.3, s * (W / 2) - (s > 0 ? 0.3 : 0), s * (W / 2) + (s > 0 ? 0 : 0.3), floor, floor + 0.9, CREAM);

  // Main hall (rear).
  const hA0 = -L / 2 + 1.6, hA1 = L * 0.1, hB = W / 2 - 2.2;
  const hallEave = floor + 4.6;
  m.box(hA0, hA1, -hB, hB, floor, hallEave, RED, null);
  m.box(hA0 - 0.05, hA1 + 0.05, -hB - 0.05, hB + 0.05, floor, floor + 1.0, CREAM, null);
  const hallMid: [number, number] = [(hA0 + hA1) / 2, 0];
  windowRow(m, hA1, -hB, hA1, hB, floor + 0.2, floor + 3.3, (2 * hB) / 3, 1.9, DARK, hallMid);
  windowRow(m, hA0, -hB, hA1, -hB, floor + 1.6, floor + 3.2, 3.4, 1.3, DARK, hallMid);
  windowRow(m, hA0, hB, hA1, hB, floor + 1.6, floor + 3.2, 3.4, 1.3, DARK, hallMid);
  curvedRoof(m, (hA0 + hA1) / 2, 0, hB, (hA1 - hA0) / 2, hallEave, 3.3, 1.5, RED);

  // Open front pavilion with a two-tier roof.
  const pA0 = hA1 + 0.6, pA1 = L / 2 - 3.4, pB = W / 2 - 3.6;
  const pavEave = floor + 5.0;
  for (const a of [pA0 + 0.4, pA1 - 0.4]) for (const bb of [-pB + 0.4, -pB / 3, pB / 3, pB - 0.4]) m.lathe(a, bb, [[0.3, floor], [0.26, pavEave + 0.2]], 6, RED);
  m.box(pA0, pA1, -pB, pB, pavEave - 0.5, pavEave, RED_DARK, null, true);
  curvedRoof(m, (pA0 + pA1) / 2, 0, pB, (pA1 - pA0) / 2, pavEave, 2.0, 1.5, RED_DARK);
  const uA = (pA1 - pA0) * 0.27, uB = pB * 0.62, pc = (pA0 + pA1) / 2;
  m.box(pc - uA, pc + uA, -uB, uB, pavEave + 1.0, pavEave + 3.0, RED, null);
  windowRow(m, pc + uA, -uB, pc + uA, uB, pavEave + 1.9, pavEave + 2.7, 1.6, 1.0, GOLD, [pc, 0]);
  curvedRoof(m, pc, 0, uB, uA, pavEave + 3.0, 2.3, 1.3, RED_DARK);
  return m.mesh(ctx, 'tua-pek-kong');
};
