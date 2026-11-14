// Borneo Cultures Museum (2022) - APPROXIMATE procedural model.
// Mapped (OSM way 835977956): position, outline, orientation, building:levels = 5.
// Approximated: storey height (museum floors are taller than the generic 3.3 m), the faceted
// gold / bronze diamond cladding (described publicly as a black-and-gold woven-craft motif), the
// glazed ground floor, the shallow golden arched roof, colours.
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { Model, col, findBuilding, fitFootprint, ringLocal, sliceExtent, windowRing, type V3 } from './kit.ts';

export const BORNEO_CULTURES_MUSEUM_BUILDING = 835977956;

const GOLD = col(0xcfa84a);
const GOLD_2 = col(0xb48f3a);
const GOLD_3 = col(0xdcbb62);
const BRONZE = col(0x4f4128);
const GLASS = col(0x41525c);
const FRAME = col(0x8f8a80);
const ROOF = col(0xc19d45);

/** Assumed museum storey height in metres (OSM gives 5 levels; the height itself is not mapped). */
const STOREY = 5.2;

export const buildBorneoCulturesMuseum: LandmarkBuilder = ({ data, ctx }) => {
  const b = findBuilding(data, [BORNEO_CULTURES_MUSEUM_BUILDING]);
  if (!b) return null;
  const fp = fitFootprint(b, data, ctx);
  const m = new Model().frame(fp);
  const loc = ringLocal(fp);
  const g = fp.gMin, gTop = Math.max(g, fp.gMean);
  const levels = fp.hs === 1 ? Math.max(3, Math.round((fp.h - 1) / 3.3)) : 5;
  const base = gTop + STOREY, top = gTop + levels * STOREY;

  // Glazed ground floor.
  m.walls(loc, g - 0.6, base, GLASS);
  windowRing(m, loc, g, base - 0.4, 6, 0.35, FRAME);

  // Faceted diamond cladding: every cell is a shallow four-sided pyramid.
  const n = loc.length / 2;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i++) area += loc[j * 2] * loc[i * 2 + 1] - loc[i * 2] * loc[j * 2 + 1];
  const s = area > 0 ? 1 : -1;
  const rows = Math.max(2, Math.round((top - base) / 5.2));
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ax = loc[j * 2], az = loc[j * 2 + 1], bx = loc[i * 2], bz = loc[i * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const ox = dz * s, oz = -dx * s; // outward
    const cols = Math.max(1, Math.round(len / 5.5));
    for (let cI = 0; cI < cols; cI++) {
      for (let r = 0; r < rows; r++) {
        const s0 = (cI / cols) * len, s1 = ((cI + 1) / cols) * len;
        const y0 = base + ((top - base) * r) / rows, y1 = base + ((top - base) * (r + 1)) / rows;
        const p00: V3 = [ax + dx * s0, y0, az + dz * s0], p10: V3 = [ax + dx * s1, y0, az + dz * s1];
        const p11: V3 = [ax + dx * s1, y1, az + dz * s1], p01: V3 = [ax + dx * s0, y1, az + dz * s0];
        const sm = (s0 + s1) / 2, bump = 0.7;
        const c: V3 = [ax + dx * sm + ox * bump, (y0 + y1) / 2, az + dz * sm + oz * bump];
        const ref: V3 = [ax + dx * sm - ox * 3, (y0 + y1) / 2, az + dz * sm - oz * 3];
        const odd = (cI + r) % 2 === 1;
        m.poly([p00, p10, c], odd ? BRONZE : GOLD_2, ref);
        m.poly([p10, p11, c], odd ? GOLD : GOLD_3, ref);
        m.poly([p11, p01, c], odd ? GOLD_3 : GOLD, ref);
        m.poly([p01, p00, c], odd ? GOLD_2 : BRONZE, ref);
      }
    }
  }
  m.cap(loc, [], top, BRONZE);

  // Shallow golden arched roof: a vault across the short axis that fades out towards both ends.
  const NA = 22, NB = 8, rise = 6.5;
  let prev: V3[] | null = null;
  for (let i = 0; i <= NA; i++) {
    const u = (i + 0.02) / (NA + 0.04) + 0;
    const a = -fp.L / 2 + 0.6 + u * (fp.L - 1.2);
    const e = sliceExtent(loc, a);
    if (!e) { prev = null; continue; }
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, i / NA))) ** 0.6;
    const cur: V3[] = [];
    for (let k = 0; k <= NB; k++) cur.push([a, top + 0.05 + rise * taper * Math.sin((Math.PI * k) / NB), e[0] + 0.5 + ((e[1] - e[0] - 1) * k) / NB]);
    if (prev) {
      for (let k = 0; k < NB; k++) {
        const ref: V3 = [(prev[k][0] + cur[k][0]) / 2, top - 5, (prev[k][2] + cur[k + 1][2]) / 2];
        m.poly([prev[k], prev[k + 1], cur[k + 1]], k % 2 ? ROOF : GOLD_3, ref);
        m.poly([prev[k], cur[k + 1], cur[k]], k % 2 ? ROOF : GOLD_3, ref);
      }
    }
    prev = cur;
  }
  return m.mesh(ctx, 'borneo-cultures-museum');
};
