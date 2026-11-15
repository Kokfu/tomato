// Things standing in a district five-foot way: columns and the goods shops put out. Pure geometry
// (no three.js) so the facade builder draws exactly what the collision world blocks.
import { ARCADE_DEPTH, edgeOutward, ringArea2 } from '../arch/frontage.ts';
import { FRONT, planFront } from './mainBazaar.ts';
import type { Lot } from './mainBazaar.ts';

export const COLUMN = 0.46;
export const ITEM = { column: 0, table: 1, pots: 2, jars: 3, rack: 4, cafe: 5, crates: 6 } as const;

export interface Item {
  kind: number;
  /** Centre: metres along the lot from its start, and depth behind the street face of the columns. */
  a: number; d: number;
  /** Half extents along the frontage and in depth; height. */
  ha: number; hd: number; h: number;
  /** Variation bits. */
  v: number;
}

/** Columns and merchandise of one lot. Positions are approximations (not surveyed). */
export function lotItems(lot: Lot, w: number, first: boolean, last: boolean): Item[] {
  const out: Item[] = [{ kind: ITEM.column, a: first ? COLUMN / 2 : 0, d: COLUMN / 2, ha: COLUMN / 2, hd: COLUMN / 2, h: 3.05, v: 0 }];
  if (last) out.push({ kind: ITEM.column, a: w - COLUMN / 2, d: COLUMN / 2, ha: COLUMN / 2, hd: COLUMN / 2, h: 3.05, v: 0 });
  const h = lot.h;
  const trading = lot.front === FRONT.open || lot.front === FRONT.half;
  // Beside the columns, on the street edge: plants and big jars (also outside closed shops).
  if ((h >>> 3) % 3 !== 0) out.push({ kind: ITEM.pots, a: 0.72, d: 0.3, ha: 0.24, hd: 0.24, h: 1.1, v: h >>> 5 });
  if (trading && (h >>> 7) % 3 === 0) out.push({ kind: ITEM.jars, a: w - 0.78, d: 0.34, ha: 0.34, hd: 0.26, h: 0.95, v: h >>> 9 });
  if (!trading) return out;
  // Against the shopfront, mid-lot: one display per trading lot.
  const pick = (h >>> 12) % 5;
  const a = w * (0.36 + ((h >>> 15) % 4) * 0.09);
  if (lot.interior === 1) {
    if (pick < 3) out.push({ kind: ITEM.cafe, a, d: ARCADE_DEPTH - 0.5, ha: 0.75, hd: 0.42, h: 0.76, v: h >>> 17 });
  } else if (pick === 0 || pick === 1) out.push({ kind: ITEM.table, a, d: ARCADE_DEPTH - 0.36, ha: 0.8, hd: 0.3, h: 0.82, v: h >>> 17 });
  else if (pick === 2) out.push({ kind: ITEM.rack, a, d: ARCADE_DEPTH - 0.28, ha: 0.34, hd: 0.2, h: 1.75, v: h >>> 17 });
  else if (pick === 3) out.push({ kind: ITEM.crates, a, d: ARCADE_DEPTH - 0.38, ha: 0.55, hd: 0.3, h: 0.9, v: h >>> 17 });
  return out;
}

export interface Obstacle { ring: number[]; h: number }

/** Collision outlines (world or chunk-local metres, same frame as `ring`) of everything standing in the five-foot ways of a block. */
export function frontObstacles(buildingId: number, ring: ArrayLike<number>, fronts: ArrayLike<number>): Obstacle[] {
  const out: Obstacle[] = [];
  const n = ring.length / 2, a2 = ringArea2(ring);
  for (let k = 0; k < fronts.length; k++) {
    const i = fronts[k], j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2) continue;
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const [nx, nz] = edgeOutward(ring, i, a2);
    const lots = planFront(buildingId, i, len);
    const w = len / lots.length;
    lots.forEach((lot, u) => {
      for (const it of lotItems(lot, w, u === 0, u === lots.length - 1)) {
        const cx = ax + ex * (u * w + it.a) - nx * it.d, cz = az + ez * (u * w + it.a) - nz * it.d;
        const r: number[] = [];
        for (const [sa, sd] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(cx + ex * it.ha * sa - nx * it.hd * sd, cz + ez * it.ha * sa - nz * it.hd * sd);
        out.push({ ring: r, h: it.h });
      }
    });
  }
  return out;
}

/** Height of the raised five-foot-way floor above the terrain (metres). */
export const FLOOR_RISE = 0.14;
/** Floor level of one lot's walkway: the same rule the facade builder uses. (x, z) = lot centre on the street face. */
export function lotFloor(sample: (x: number, z: number) => number, x: number, z: number, nx: number, nz: number): number {
  return Math.max(sample(x, z), sample(x - nx * ARCADE_DEPTH, z - nz * ARCADE_DEPTH)) + FLOOR_RISE;
}

/** Raised walkway slabs of a block (same frame as `ring`): the character stands on these, not on the terrain below. */
export function frontFloors(buildingId: number, ring: ArrayLike<number>, fronts: ArrayLike<number>, sample: (x: number, z: number) => number): Obstacle[] {
  const out: Obstacle[] = [];
  const n = ring.length / 2, a2 = ringArea2(ring);
  for (let k = 0; k < fronts.length; k++) {
    const i = fronts[k], j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2) continue;
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const [nx, nz] = edgeOutward(ring, i, a2);
    const lots = planFront(buildingId, i, len).length, w = len / lots;
    for (let u = 0; u < lots; u++) {
      const x0 = ax + ex * w * u, z0 = az + ez * w * u, x1 = x0 + ex * w, z1 = z0 + ez * w;
      const d = ARCADE_DEPTH + 0.05;
      out.push({ ring: [x0, z0, x1, z1, x1 - nx * d, z1 - nz * d, x0 - nx * d, z0 - nz * d], h: lotFloor(sample, (x0 + x1) / 2, (z0 + z1) / 2, nx, nz) });
    }
  }
  return out;
}
