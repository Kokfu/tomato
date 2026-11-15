import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';

interface Kit { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; palmTrunk: THREE.BufferGeometry; fronds: THREE.BufferGeometry }
let kit: Kit | null = null;

/** Bake a vertical shading gradient into vertex colours (cheap ambient occlusion inside the canopy). */
function shade(g: THREE.BufferGeometry, lo: number, hi: number, dark: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - lo) / (hi - lo), 0, 1);
    const v = dark + (1 - dark) * t;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const n = g;
    pos.push(...(n.getAttribute('position').array as Float32Array));
    nor.push(...(n.getAttribute('normal').array as Float32Array));
    if (n.index) for (const i of n.index.array as Uint16Array) idx.push(base + i);
    else for (let i = 0; i < n.getAttribute('position').count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
function shared(): Kit {
  if (kit) return kit;
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1, 6, 1, true).translate(0, 0.5, 0);
  // Broad rain-tree style canopy: a few overlapping low-poly lobes (100 triangles in total; trees
  // are the most numerous objects in view, so the budget per tree is small).
  const lobes: [number, number, number, number][] = [[0, 0, 0, 1], [0.62, -0.12, 0.2, 0.68], [-0.5, -0.08, 0.42, 0.72], [-0.15, -0.1, -0.66, 0.66], [0.1, 0.42, 0.05, 0.6]];
  const crown = shade(merge(lobes.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).scale(1, 0.72, 1).rotateY(x * 2.1 + z).translate(x, y, z))), -0.7, 0.8, 0.5);
  const palmTrunk = new THREE.CylinderGeometry(0.09, 0.16, 1, 5, 1, true).translate(0, 0.5, 0);
  // Coconut-palm crown: arching fronds, each a bent strip that droops toward the tip.
  const fr: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    const g = new THREE.PlaneGeometry(0.34, 1, 1, 4).translate(0, 0.5, 0);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k); // 0 at the stem, 1 at the tip
      const w = p.getX(k) * (1 - t * 0.75);
      p.setXYZ(k, w, 0.28 * Math.sin(t * 2.4) - 0.5 * t * t, t);
    }
    g.computeVertexNormals();
    fr.push(g.rotateY(a));
  }
  const fronds = shade(merge(fr), -0.5, 0.25, 0.62);
  kit = { trunk, crown, palmTrunk, fronds };
  return kit;
}
function hash(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Instanced trees. `trees` are individually mapped OSM trees; `ptrees` are procedural positions
 * generated offline inside mapped wood/park polygons (never on roads, buildings or water).
 * Species and size are not mapped: a deterministic mix of broad-canopy trees and palms stands in
 * for Kuching's street planting (inferred appearance).
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
  const k = shared();
  const isPalm = (i: number) => hash(pts[i * 2] + 91, pts[i * 2 + 1] + 13) < 0.24;
  let palms = 0;
  for (let i = 0; i < n; i++) if (isPalm(i)) palms++;
  const mk = (g: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
    const m = new THREE.InstancedMesh(g, mat, count);
    m.userData.sharedGeometry = true;
    return m;
  };
  const trunks = mk(k.trunk, ctx.mats.trunk, n - palms), crowns = mk(k.crown, ctx.mats.crown, n - palms);
  const ptrunks = mk(k.palmTrunk, ctx.mats.trunk, palms), fronds = mk(k.fronds, ctx.mats.frond, palms);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let it = 0, ip = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2] / QUANT, z = pts[i * 2 + 1] / QUANT;
    const h1 = hash(pts[i * 2], pts[i * 2 + 1]), h2 = hash(pts[i * 2 + 1] + 17, pts[i * 2] - 5);
    const y = ctx.height.sample(ox + x, oz + z);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h1 * 6.283);
    if (isPalm(i)) {
      const th = 6 + h1 * 4.5;
      m.compose(p.set(x, y, z), q, s.set(1, th, 1));
      ptrunks.setMatrixAt(ip, m);
      const fs = 2.6 + h2 * 1.1;
      m.compose(p.set(x, y + th, z), q, s.set(fs, fs, fs));
      fronds.setMatrixAt(ip, m);
      fronds.setColorAt(ip, c.setHSL(0.26 + h2 * 0.05, 0.5, 0.3 + h1 * 0.08));
      ip++;
    } else {
      const trunkH = 2.8 + h1 * 2.4;
      const r = 2.6 + h2 * 2.2;
      m.compose(p.set(x, y, z), q, s.set(1 + h2 * 0.8, trunkH, 1 + h2 * 0.8));
      trunks.setMatrixAt(it, m);
      m.compose(p.set(x, y + trunkH + r * 0.5, z), q, s.set(r, r * (0.8 + h1 * 0.3), r));
      crowns.setMatrixAt(it, m);
      crowns.setColorAt(it, c.setHSL(0.27 + h2 * 0.07, 0.45 + h1 * 0.18, 0.27 + h2 * 0.1));
      it++;
    }
  }
  const out: THREE.Object3D[] = [];
  for (const mesh of [trunks, crowns, ptrunks, fronds]) {
    if (!mesh.count) { mesh.dispose(); continue; }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh === crowns || mesh === fronds;
    mesh.computeBoundingSphere();
    out.push(mesh);
  }
  return out;
}
