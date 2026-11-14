import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData, BuildingData } from './types.ts';
import { BUILDING_KINDS } from './types.ts';
import { GeoBuf } from './Materials.ts';
import { toVec2 } from './RoadBuilder.ts';
import type { BuildContext } from './ChunkManager.ts';

type Kind = (typeof BUILDING_KINDS)[number];
const WALLS: Record<Kind, number[]> = {
  generic: [0xdcd5c8, 0xd2c9b7, 0xe6e0d3, 0xcbc1b0, 0xd9d0c2, 0xc4cacd, 0xe2d6bf],
  house: [0xe9e2d3, 0xdcd2c0, 0xedddc6, 0xdfd9cf, 0xd8c9b0],
  commercial: [0xd6d0c4, 0xc9d0d4, 0xe0d8c8, 0xcfc8ba, 0xd9c7ae],
  shophouse: [0xe8d9b8, 0xd9c4a0, 0xe3cfc0, 0xcfd8cf, 0xe6dcc8],
  religious: [0xf0ece2, 0xe9e1cf, 0xf2e6d0],
  civic: [0xf0ede6, 0xe6e2d8, 0xe9e4d6],
  industrial: [0xb9bec2, 0xc5c3bb, 0xaeb6bb],
  roof: [0xb8b4aa, 0xa9aeb0],
  tower: [0xbfcad3, 0xc9d1d6, 0xd5d3cc, 0xb4c0cb],
  hut: [0xcbbfa8, 0xbfb5a2, 0xd4cbb9],
};
const ROOFS: Record<Kind, number[]> = {
  generic: [0x8e8f91, 0x9b968f, 0x7f8387, 0xa08a7c, 0x8a7468],
  house: [0x9c4f3a, 0x8b4c3c, 0x74584a, 0x5f6973, 0xa3604a],
  commercial: [0x8c8e90, 0x9a9792, 0x7d8185],
  shophouse: [0x9a5440, 0x8a4d3b, 0xa0644e],
  religious: [0x8c4a36, 0x5d7a68, 0x9a8a5a],
  civic: [0x8a5a48, 0x7f8589, 0x9c9a94],
  industrial: [0x8d989f, 0x9ea3a5, 0x7c8890],
  roof: [0x9aa0a4, 0xb0a99c, 0x8f6f5c],
  tower: [0x7c8388, 0x8a8f93],
  hut: [0x8d7663, 0x7c7f82],
};

function hashId(id: number): number {
  let h = Math.imul(id | 0, 2654435761) ^ (id / 4294967296) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}
function area2(r: number[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return a;
}

const wallColor = new THREE.Color();
const roofColor = new THREE.Color();
const BAY = 3.4;
const STOREY = 3.3;

function addBuilding(b: BuildingData, ox: number, oz: number, ctx: BuildContext, walls: GeoBuf, roofs: GeoBuf): void {
  const kind = BUILDING_KINDS[b.k];
  const h = hashId(b.id);
  wallColor.setHex(WALLS[kind][h % WALLS[kind].length]);
  roofColor.setHex(ROOFS[kind][(h >>> 8) % ROOFS[kind].length]);
  const shade = 0.93 + ((h >>> 16) % 100) / 100 * 0.1;
  wallColor.multiplyScalar(shade);

  const rings = b.r.map((r) => r.map((v) => v / QUANT));
  // Base follows the lowest ground under the footprint; the roof sits at mean ground + height.
  let gMin = Infinity, gSum = 0, n = 0;
  const outer = rings[0];
  for (let i = 0; i < outer.length; i += 2) {
    const g = ctx.height.sample(ox + outer[i], oz + outer[i + 1]);
    gMin = Math.min(gMin, g);
    gSum += g;
    n++;
  }
  const height = b.h / QUANT;
  const top = gSum / n + height;
  const isRoof = kind === 'roof';
  const y0 = isRoof ? top - 0.35 : gMin - 0.3;

  rings.forEach((r, ri) => {
    const ccw = area2(r) > 0 !== ri > 0; // holes face the other way
    let u = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], az = r[j + 1], bx = r[i], bz = r[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const s = ccw ? 1 : -1;
      const nx = (dz / len) * s, nz = (-dx / len) * s;
      // Whole number of bays per wall so windows are not cut at corners.
      const bays = Math.max(1, Math.round(len / BAY));
      const u0 = u, u1 = u + bays;
      const v0 = 0, v1 = isRoof ? 0.05 : Math.max(1, Math.round((top - y0 - 0.3) / STOREY));
      const A = walls.vert(ax, y0, az, nx, 0, nz, wallColor, u0, v0);
      const B = walls.vert(bx, y0, bz, nx, 0, nz, wallColor, u1, v0);
      const A2 = walls.vert(ax, top, az, nx, 0, nz, wallColor, u0, v1);
      const B2 = walls.vert(bx, top, bz, nx, 0, nz, wallColor, u1, v1);
      if (ccw) { walls.tri(B, A, A2); walls.tri(B, A2, B2); } else { walls.tri(A, B, B2); walls.tri(A, B2, A2); }
      u = u1;
    }
  });

  // Roof (flat cap following the mapped footprint, holes preserved).
  const contour = toVec2(rings[0]);
  const holes = rings.slice(1).map(toVec2);
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  } catch {
    return;
  }
  const base = roofs.count;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) roofs.vert(r[i], top, r[i + 1], 0, 1, 0, roofColor);
  for (const t of tris) roofs.triUp(base + t[0], base + t[1], base + t[2]);
}

/** One merged wall mesh and one merged roof mesh per chunk, generated from the mapped footprints. */
export function buildBuildings(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const walls = new GeoBuf(true);
  const roofs = new GeoBuf();
  for (const b of data.buildings) {
    if (ctx.landmarks.replacesBuilding(b.id)) continue;
    addBuilding(b, ox, oz, ctx, walls, roofs);
  }
  const out: THREE.Object3D[] = [];
  const wg = walls.build();
  if (wg) {
    const m = new THREE.Mesh(wg, ctx.detail === 'high' ? ctx.mats.wallsTextured : ctx.mats.wallsPlain);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
  }
  const rg = roofs.build();
  if (rg) {
    const m = new THREE.Mesh(rg, ctx.mats.roofs);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}
