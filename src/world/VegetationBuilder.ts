import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';

let trunkGeo: THREE.BufferGeometry | null = null;
let crownGeo: THREE.BufferGeometry | null = null;
function shared(): [THREE.BufferGeometry, THREE.BufferGeometry] {
  if (!trunkGeo) {
    trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6, 1, true);
    trunkGeo.translate(0, 0.5, 0);
    crownGeo = new THREE.IcosahedronGeometry(1, 1);
  }
  return [trunkGeo, crownGeo!];
}
function hash(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Instanced trees. `trees` are individually mapped OSM trees; `ptrees` are procedural positions
 * generated offline inside mapped wood/park polygons (never on roads, buildings or water).
 * Tree size and species are not mapped, so the appearance is generic and deterministic.
 */
export function buildVegetation(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  const density = ctx.quality.treeDensity;
  const pts: number[] = [];
  for (let i = 0; i < data.trees.length; i += 2) pts.push(data.trees[i], data.trees[i + 1]);
  for (let i = 0; i < data.ptrees.length; i += 2) {
    if (density < 1 && hash(data.ptrees[i], data.ptrees[i + 1]) > density) continue;
    pts.push(data.ptrees[i], data.ptrees[i + 1]);
  }
  const n = pts.length / 2;
  if (!n) return [];
  const [tg, cg] = shared();
  const trunks = new THREE.InstancedMesh(tg, ctx.mats.trunk, n);
  const crowns = new THREE.InstancedMesh(cg, ctx.mats.crown, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2] / QUANT, z = pts[i * 2 + 1] / QUANT;
    const h1 = hash(pts[i * 2], pts[i * 2 + 1]), h2 = hash(pts[i * 2 + 1] + 17, pts[i * 2] - 5);
    const y = ctx.height.sample(ox + x, oz + z);
    const trunkH = 2.6 + h1 * 2.6;
    const r = 2.0 + h2 * 1.9;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h1 * 6.283);
    m.compose(p.set(x, y, z), q, s.set(1 + h2 * 0.6, trunkH, 1 + h2 * 0.6));
    trunks.setMatrixAt(i, m);
    m.compose(p.set(x, y + trunkH + r * 0.55, z), q, s.set(r, r * (0.75 + h1 * 0.3), r));
    crowns.setMatrixAt(i, m);
    c.setHSL(0.27 + h2 * 0.07, 0.42 + h1 * 0.18, 0.26 + h2 * 0.1);
    crowns.setColorAt(i, c);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns.castShadow = true;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  trunks.userData.sharedGeometry = true;
  crowns.userData.sharedGeometry = true;
  return [trunks, crowns];
}
