import { CHUNK_SIZE, QUANT, chunkKey } from './config.ts';
import type { ChunkData } from './types.ts';
import { BUILDING_KINDS } from './types.ts';
import type { HeightMap } from './HeightMap.ts';
import { ARCADE_DEPTH, insetEdges } from './arch/frontage.ts';
import { isDistrictRow } from './district/mainBazaar.ts';
import { frontFloors, frontObstacles } from './district/frontLayout.ts';
import { districtFloors, propObstacles } from './district/props.ts';

interface Wall {
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Rings in world metres: [x0,z0,x1,z1,...] (closed implicitly). */
  rings: Float32Array[];
  top: number;
}
interface WaterPoly { minX: number; maxX: number; minZ: number; maxZ: number; rings: Float32Array[] }
interface ChunkCollision {
  walls: Wall[];
  water: WaterPoly[];
  /** 7 floats per deck segment: ax, az, ah, bx, bz, bh, halfWidth (world metres). */
  decks: Float32Array;
  pdecks: { ring: Float32Array; h: number; minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** Raised paving (district five-foot ways): stood on like a deck, but it is ordinary ground. */
  floors: { ring: Float32Array; h: number; minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** 5 floats per mapped building passage segment: ax, az, bx, bz, halfWidth. */
  pass: Float32Array;
}

export interface Ground { h: number; deck: boolean }

function toWorld(arr: number[], ox: number, oz: number): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 2) {
    out[i] = ox + arr[i] / QUANT;
    out[i + 1] = oz + arr[i + 1] / QUANT;
  }
  return out;
}
function bbox(r: Float32Array) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < minX) minX = r[i];
    if (r[i] > maxX) maxX = r[i];
    if (r[i + 1] < minZ) minZ = r[i + 1];
    if (r[i + 1] > maxZ) maxZ = r[i + 1];
  }
  return { minX, maxX, minZ, maxZ };
}
export function pointInRing(x: number, z: number, r: ArrayLike<number>): boolean {
  let inside = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function pointInRings(x: number, z: number, rings: ArrayLike<number>[]): boolean {
  if (!pointInRing(x, z, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(x, z, rings[i])) return false;
  return true;
}

/** Simplified collision world, independent of visual detail and graphics settings. */
export class CollisionWorld {
  private chunks = new Map<string, ChunkCollision>();
  readonly height: HeightMap;
  /** Step height the character can climb / snap to (metres). */
  static STEP = 0.6;

  constructor(height: HeightMap) {
    this.height = height;
  }

  addChunk(data: ChunkData): void {
    const ox = data.cx * CHUNK_SIZE;
    const oz = data.cz * CHUNK_SIZE;
    const roofKind = BUILDING_KINDS.indexOf('roof');
    const walls: Wall[] = [];
    const floors: ChunkCollision['floors'] = [];
    for (const b of data.buildings) {
      if (b.k === roofKind) continue; // open-sided roofs do not block movement
      const rings = b.r.map((r) => toWorld(r, ox, oz));
      // Shophouse rows: the five-foot way behind the street frontage is walkable, so the blocking
      // outline is the recessed shopfront line (same geometry the facade builder draws).
      if (b.a?.f.length) rings[0] = Float32Array.from(insetEdges(rings[0], b.a.f, ARCADE_DEPTH));
      const base = this.height.sample(rings[0][0], rings[0][1]);
      walls.push({ ...bbox(rings[0]), rings, top: base + b.h / QUANT });
      // District rows: piers and the goods standing in the five-foot way block movement too.
      if (isDistrictRow(b, ox, oz)) {
        for (const fl of frontFloors(b.id, toWorld(b.r[0], ox, oz), b.a!.f, (x, z) => this.height.sample(x, z))) {
          const ring = Float32Array.from(fl.ring);
          floors.push({ ring, h: fl.h, ...bbox(ring) });
        }
        for (const o of frontObstacles(b.id, toWorld(b.r[0], ox, oz), b.a!.f)) {
          const ring = Float32Array.from(o.ring);
          walls.push({ ...bbox(ring), rings: [ring], top: base + o.h });
        }
      }
    }
    for (const fl of districtFloors(data)) {
      const ring = Float32Array.from(fl.ring);
      floors.push({ ring, h: this.height.sample((ring[0] + ring[4]) / 2, (ring[1] + ring[5]) / 2) + fl.rise, ...bbox(ring) });
    }
    // District street dressing (parked cars, tree trunks, planters, lamp posts, benches).
    for (const o of propObstacles(data)) {
      const ring = Float32Array.from(o.ring);
      walls.push({ ...bbox(ring), rings: [ring], top: this.height.sample(ring[0], ring[1]) + o.h });
    }
    const water: WaterPoly[] = data.water.map((poly) => {
      const rings = poly.map((r) => toWorld(r, ox, oz));
      return { ...bbox(rings[0]), rings };
    });
    const decks = new Float32Array(data.decks.length);
    for (let i = 0; i < data.decks.length; i += 7) {
      decks[i] = ox + data.decks[i] / QUANT;
      decks[i + 1] = oz + data.decks[i + 1] / QUANT;
      decks[i + 2] = data.decks[i + 2] / QUANT;
      decks[i + 3] = ox + data.decks[i + 3] / QUANT;
      decks[i + 4] = oz + data.decks[i + 4] / QUANT;
      decks[i + 5] = data.decks[i + 5] / QUANT;
      decks[i + 6] = data.decks[i + 6] / QUANT;
    }
    const pdecks = data.pdecks.map((d) => {
      const ring = toWorld(d.r, ox, oz);
      return { ring, h: d.h / QUANT, ...bbox(ring) };
    });
    const src = data.pass ?? [];
    const pass = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 5) {
      pass[i] = ox + src[i] / QUANT;
      pass[i + 1] = oz + src[i + 1] / QUANT;
      pass[i + 2] = ox + src[i + 2] / QUANT;
      pass[i + 3] = oz + src[i + 3] / QUANT;
      pass[i + 4] = src[i + 4] / QUANT;
    }
    this.chunks.set(chunkKey(data.cx, data.cz), { walls, water, decks, pdecks, pass, floors });
  }

  removeChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  private at(x: number, z: number): ChunkCollision | undefined {
    return this.chunks.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  }

  /** True when collision data for the chunk containing (x, z) is loaded. */
  isLoaded(x: number, z: number): boolean {
    return this.at(x, z) !== undefined;
  }

  /**
   * Supporting surface under a character whose feet are at height y: the terrain, or the highest
   * bridge/pier deck that is not more than STEP above the feet.
   */
  groundAt(x: number, z: number, y: number): Ground {
    let h = this.height.sample(x, z);
    let deck = false;
    const c = this.at(x, z);
    if (!c) return { h, deck };
    const lim = y + CollisionWorld.STEP;
    const d = c.decks;
    for (let i = 0; i < d.length; i += 7) {
      const ax = d[i], az = d[i + 1], bx = d[i + 3], bz = d[i + 4], hw = d[i + 6];
      const vx = bx - ax, vz = bz - az;
      const len2 = vx * vx + vz * vz;
      let t = len2 > 0 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t - x, pz = az + vz * t - z;
      if (px * px + pz * pz > hw * hw) continue;
      const dh = d[i + 2] + (d[i + 5] - d[i + 2]) * t;
      if (dh <= lim && (dh > h || !deck)) {
        if (dh >= h - 0.05) { h = Math.max(h, dh); deck = true; }
      }
    }
    for (const p of c.floors) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      if (p.h <= lim && p.h > h && pointInRing(x, z, p.ring)) h = p.h;
    }
    for (const p of c.pdecks) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      if (p.h <= lim && p.h >= h - 0.05 && pointInRing(x, z, p.ring)) { h = Math.max(h, p.h); deck = true; }
    }
    return { h, deck };
  }

  inWater(x: number, z: number): boolean {
    const c = this.at(x, z);
    if (!c) return false;
    for (const w of c.water) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (pointInRings(x, z, w.rings)) return true;
    }
    return false;
  }

  private forNearWalls(x: number, z: number, pad: number, fn: (w: Wall) => void): void {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!c) continue;
        for (const w of c.walls) {
          if (x < w.minX - pad || x > w.maxX + pad || z < w.minZ - pad || z > w.maxZ + pad) continue;
          fn(w);
        }
      }
  }

  /** True inside the corridor of a mapped passage through a building (tunnel=building_passage, covered ways). */
  inPassage(x: number, z: number): boolean {
    const c = this.at(x, z);
    if (!c) return false;
    const p = c.pass;
    for (let i = 0; i < p.length; i += 5) {
      const ax = p[i], az = p[i + 1], vx = p[i + 2] - ax, vz = p[i + 3] - az;
      const l2 = vx * vx + vz * vz;
      let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + vx * t - x, dz = az + vz * t - z;
      if (dx * dx + dz * dz <= p[i + 4] * p[i + 4]) return true;
    }
    return false;
  }

  /** Push a circle (radius r, feet at height y) out of building footprints. Returns corrected [x, z]. */
  resolve(x: number, z: number, r: number, y: number): [number, number] {
    if (this.inPassage(x, z)) return [x, z];
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.forNearWalls(x, z, r, (w) => {
        if (y >= w.top - 0.05) return; // standing above the roof line
        for (const ring of w.rings) {
          const n = ring.length;
          for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
            const ax = ring[j], az = ring[j + 1], bx = ring[i], bz = ring[i + 1];
            const vx = bx - ax, vz = bz - az;
            const len2 = vx * vx + vz * vz;
            if (len2 < 1e-8) continue;
            let t = ((x - ax) * vx + (z - az) * vz) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = x - (ax + vx * t), dz = z - (az + vz * t);
            const d2 = dx * dx + dz * dz;
            if (d2 < r * r && d2 > 1e-10) {
              const d = Math.sqrt(d2);
              x += (dx / d) * (r - d);
              z += (dz / d) * (r - d);
              moved = true;
            }
          }
        }
      });
      if (!moved) break;
    }
    return [x, z];
  }

  /** True when the point lies inside a building footprint (below its roof). */
  insideBuilding(x: number, z: number, y: number): boolean {
    let hit = false;
    if (this.inPassage(x, z)) return false;
    this.forNearWalls(x, z, 0, (w) => {
      if (!hit && y < w.top && pointInRings(x, z, w.rings)) hit = true;
    });
    return hit;
  }

  /**
   * Cast a horizontal-projected ray against building walls (used by the camera).
   * Returns the smallest t in (0, 1] where origin + t * delta hits a wall, or 1 if clear.
   */
  rayWalls(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    let best = 1;
    const mx = ox + dx * 0.5, mz = oz + dz * 0.5;
    const pad = Math.hypot(dx, dz) * 0.5 + 0.5;
    this.forNearWalls(mx, mz, pad, (w) => {
      for (const ring of w.rings) {
        const n = ring.length;
        for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
          const ax = ring[j], az = ring[j + 1];
          const ex = ring[i] - ax, ez = ring[i + 1] - az;
          const den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((ax - ox) * ez - (az - oz) * ex) / den;
          if (t <= 0 || t >= best) continue;
          const u = ((ax - ox) * dz - (az - oz) * dx) / den;
          if (u < 0 || u > 1) continue;
          if (oy + dy * t > w.top) continue; // ray passes above the building
          best = t;
        }
      }
    });
    return best;
  }
}
