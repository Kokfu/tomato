// Drivable-road lookup on the streamed chunk data. Pure functions (no three.js, no DOM): the same code
// runs in the game and in the Node unit tests that validate the playable road area.
//
// Nothing here invents geometry: a "road" is a mapped OpenStreetMap carriageway exactly as stored in
// the chunk files (polyline, class, width, one-way flag, bridge elevations).
import { CHUNK_SIZE, QUANT } from '../world/config.ts';
import type { ChunkData, RoadData } from '../world/types.ts';
import { ROAD_TYPES } from '../world/types.ts';

/** Road classes a car may use: motorway ... service. Pedestrian streets, footways, paths and piers are not. */
export const DRIVABLE_CLASSES: ReadonlySet<string> = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']);

/** Clearance wanted on each side of the car body before a carriageway counts as wide enough (metres). */
export const SIDE_CLEARANCE = 0.4;

export function isDrivable(r: RoadData, carWidth: number): boolean {
  return DRIVABLE_CLASSES.has(ROAD_TYPES[r.t]) && r.w / QUANT >= carWidth + 2 * SIDE_CLEARANCE;
}

export interface RoadHit {
  /** OSM way id. */
  id: number;
  name: string | null;
  /** Road class (ROAD_TYPES). */
  type: string;
  /** Carriageway width, metres. */
  width: number;
  /** Distance from the query point to the centre line, metres. */
  dist: number;
  /** Nearest point on the centre line, world metres. */
  x: number; z: number;
  /** Unit direction of the segment, in the way's vertex order (the direction of travel on a one-way). */
  dx: number; dz: number;
  oneWay: boolean;
  bridge: boolean;
}

export type ChunkLookup = (cx: number, cz: number) => ChunkData | undefined;

/**
 * Nearest drivable carriageway to (x, z) within `maxDist` metres of its centre line, searched in the
 * chunks that can contain it. Returns null when there is none (or its data is not loaded).
 */
export function nearestDrivable(dataAt: ChunkLookup, x: number, z: number, carWidth: number, maxDist = 30): RoadHit | null {
  const c0x = Math.floor((x - maxDist) / CHUNK_SIZE), c1x = Math.floor((x + maxDist) / CHUNK_SIZE);
  const c0z = Math.floor((z - maxDist) / CHUNK_SIZE), c1z = Math.floor((z + maxDist) / CHUNK_SIZE);
  let best = maxDist, hit: RoadHit | null = null;
  for (let cz = c0z; cz <= c1z; cz++)
    for (let cx = c0x; cx <= c1x; cx++) {
      const d = dataAt(cx, cz);
      if (!d) continue;
      const lx = (x - cx * CHUNK_SIZE) * QUANT, lz = (z - cz * CHUNK_SIZE) * QUANT, lim = best * QUANT;
      for (const r of d.roads) {
        if (!isDrivable(r, carWidth)) continue;
        const p = r.p;
        for (let i = 2; i < p.length; i += 2) {
          const ax = p[i - 2], az = p[i - 1], vx = p[i] - ax, vz = p[i + 1] - az;
          // Cheap reject on the segment's bounding box before the projection.
          if (lx < Math.min(ax, p[i]) - lim || lx > Math.max(ax, p[i]) + lim || lz < Math.min(az, p[i + 1]) - lim || lz > Math.max(az, p[i + 1]) + lim) continue;
          const l2 = vx * vx + vz * vz;
          if (l2 < 1) continue;
          let t = ((lx - ax) * vx + (lz - az) * vz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + vx * t, qz = az + vz * t;
          const dist = Math.hypot(qx - lx, qz - lz) / QUANT;
          if (dist >= best) continue;
          best = dist;
          const l = Math.sqrt(l2);
          hit = {
            id: r.id, name: r.n !== undefined ? d.names[r.n] : null, type: ROAD_TYPES[r.t], width: r.w / QUANT, dist,
            x: cx * CHUNK_SIZE + qx / QUANT, z: cz * CHUNK_SIZE + qz / QUANT, dx: vx / l, dz: vz / l,
            oneWay: (r.f & 8) !== 0, bridge: (r.f & 1) !== 0,
          };
        }
      }
    }
  return hit;
}

/** Extra distance beyond the mapped half width that still counts as "on the road" (widths are mostly inferred). */
export const ROAD_EDGE_TOLERANCE = 1.0;

export function onRoad(hit: RoadHit | null): boolean {
  return !!hit && hit.dist <= hit.width / 2 + ROAD_EDGE_TOLERANCE;
}
