import * as THREE from 'three';
import { QUANT, WATER_LEVEL } from './config.ts';
import type { ChunkData } from './types.ts';
import { toVec2 } from './RoadBuilder.ts';
import type { BuildContext } from './ChunkManager.ts';

/** Width in metres of the shallow band along a mapped bank (each side of the shoreline). */
const BANK_BAND = 3.2;

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
  const bank = new Array<number>(pos.length / 3).fill(0);
  // A ribbon along each mapped shoreline, a hair above the surface, in the same mesh: the water shader turns its
  // `bank` value (1 on the shoreline, 0 at the ribbon's edges) into shallow water and a lapping line. The half that
  // falls on the landward side lies under the bank and is never seen.
  for (const line of data.shore) {
    const n = line.length / 2;
    if (n < 2) continue;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = line[i * 2] / QUANT, z = line[i * 2 + 1] / QUANT;
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = line[b * 2] - line[a * 2], dz = line[b * 2 + 1] - line[a * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      pos.push(x + dz * BANK_BAND, WATER_LEVEL + 0.02, z - dx * BANK_BAND, x, WATER_LEVEL + 0.02, z, x - dz * BANK_BAND, WATER_LEVEL + 0.02, z + dx * BANK_BAND);
      bank.push(0, 1, 0);
      if (i) { const q = base + i * 3, o = q - 3; idx.push(o, q, o + 1, o + 1, q, q + 1, o + 1, q + 1, o + 2, o + 2, q + 1, q + 2); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('bank', new THREE.Float32BufferAttribute(bank, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, ctx.mats.water);
}
