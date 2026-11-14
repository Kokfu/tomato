import * as THREE from 'three';
import { QUANT, WATER_LEVEL } from './config.ts';
import type { ChunkData } from './types.ts';
import { toVec2 } from './RoadBuilder.ts';
import type { BuildContext } from './ChunkManager.ts';

/** Flat water surface triangulated from the mapped (chunk-clipped) river / lake polygons. */
export function buildWater(data: ChunkData, ctx: BuildContext): THREE.Mesh | null {
  if (!data.water.length) return null;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const poly of data.water) {
    const rings = poly.map((r) => r.map((v) => v / QUANT));
    let tris: number[][];
    try {
      tris = THREE.ShapeUtils.triangulateShape(toVec2(rings[0]), rings.slice(1).map(toVec2));
    } catch {
      continue;
    }
    const base = pos.length / 3;
    for (const r of rings) for (let i = 0; i < r.length; i += 2) pos.push(r[i], WATER_LEVEL, r[i + 1]);
    for (const t of tris) {
      const a = base + t[0], b = base + t[1], c = base + t[2];
      const cr = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]) - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
      if (cr >= 0) idx.push(a, b, c);
      else idx.push(a, c, b);
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, ctx.mats.water);
}
