// N1-M5 hero place 6: the cemetery round the Kuching City Mosque. Pure geometry (no three.js).
//
// WHAT IS REAL (OpenStreetMap): the cemetery polygons beside the mosque (chunks -2_-1 and -2_0), the paths and lanes
// through them. VERIFIED FORM (Wee Hong, "Masjid Bandaraya Kuching.jpg", CC BY-SA 4.0): a lawn full of low white grave
// markers in front of the mosque. APPROXIMATE: every single grave (position, spacing, which stones are white or
// dark); they are set out by rule in rows, each grave lying across the direction of Mecca (292 degrees from
// Kuching), as Muslim graves do. They have no collision.
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { ChunkData } from '../types.ts';
import { AREA_KINDS } from '../types.ts';
import { hash3 } from '../arch/frontage.ts';
import { m5Enabled } from './m5.ts';

export const GRAVE_KEYS = ['-2_-1', '-2_0'];
/** Long axis of every grave (world x, z): 22 degrees east of north. */
export const GRAVE_AXIS: [number, number] = [0.3746, -0.9272];
/** Rows are this far apart along the graves' axis and the graves this far apart in a row; share of plots in use. */
export const GRAVE_GRID = { along: 3.8, across: 2.5, used: 40 };

export interface Grave { x: number; z: number; h: number }
const cache = new Map<string, Grave[]>();

export function mosqueGraves(data: ChunkData): Grave[] {
  const key = `${data.cx}_${data.cz}`;
  if (!m5Enabled() || !GRAVE_KEYS.includes(key)) return [];
  const hit = cache.get(key);
  if (hit) return hit;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, kind = AREA_KINDS.indexOf('cemetery');
  const world = (p: number[]) => p.map((v, i) => (i % 2 ? oz : ox) + v / QUANT);
  const inRing = (x: number, z: number, r: number[]) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
  const roads = data.roads.map((r) => ({ p: world(r.p), m: r.w / QUANT / 2 + 1.6 }));
  // nothing within 3 m of a building's bounding box (the mosque's own entrance canopy reaches 6 m out)
  const boxes = data.buildings.map((b) => {
    const r = world(b.r[0]), pad = b.r[0].length > 30 ? 7 : 3;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]); }
    return [x0 - pad, x1 + pad, z0 - pad, z1 + pad];
  });
  const free = (x: number, z: number): boolean => {
    for (const b of boxes) if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) return false;
    for (const r of roads) for (let i = 2; i < r.p.length; i += 2) {
      const vx = r.p[i] - r.p[i - 2], vz = r.p[i + 1] - r.p[i - 1], t = Math.max(0, Math.min(1, ((x - r.p[i - 2]) * vx + (z - r.p[i - 1]) * vz) / (vx * vx + vz * vz || 1)));
      if (Math.hypot(r.p[i - 2] + vx * t - x, r.p[i - 1] + vz * t - z) < r.m) return false;
    }
    return true;
  };
  const [ax, az] = GRAVE_AXIS, bx = -az, bz = ax, out: Grave[] = [];
  for (const a of data.areas) {
    if (a.k !== kind) continue;
    const ring = world(a.r[0]);
    // the polygon's extent in the rows' frame (u along the graves, v across them), on a grid fixed in the world
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { const u = ring[i] * ax + ring[i + 1] * az, v = ring[i] * bx + ring[i + 1] * bz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    for (let iu = Math.ceil(u0 / GRAVE_GRID.along); iu * GRAVE_GRID.along < u1; iu++) for (let iv = Math.ceil(v0 / GRAVE_GRID.across); iv * GRAVE_GRID.across < v1; iv++) {
      const h = hash3(iu, iv, 233622270);
      if (h % 100 >= GRAVE_GRID.used) continue;
      const u = iu * GRAVE_GRID.along + (((h >>> 8) % 60) - 30) / 100, v = iv * GRAVE_GRID.across + (((h >>> 14) % 50) - 25) / 100;
      const x = u * ax + v * bx, z = u * az + v * bz;
      // the whole grave (2 m by 0.8 m) lies inside the cemetery and inside this chunk
      if (x < ox + 1.2 || z < oz + 1.2 || x > ox + CHUNK_SIZE - 1.2 || z > oz + CHUNK_SIZE - 1.2) continue;
      if (!inRing(x + ax * 1.1, z + az * 1.1, ring) || !inRing(x - ax * 1.1, z - az * 1.1, ring) || !inRing(x + bx * 0.6, z + bz * 0.6, ring) || !inRing(x - bx * 0.6, z - bz * 0.6, ring)) continue;
      if (!free(x, z)) continue;
      out.push({ x, z, h });
    }
  }
  cache.set(key, out);
  return out;
}
