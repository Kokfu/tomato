import * as THREE from 'three';
import { CHUNK_SIZE, CELL, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import { AREA_KINDS, AREA_COLORS } from './types.ts';
import type { BuildContext } from './ChunkManager.ts';

const BASE_GROUND = '#a9a694';

/** Paint mapped land-use polygons into a small ground texture for the chunk. */
function groundTexture(data: ChunkData, size: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = BASE_GROUND;
  g.fillRect(0, 0, size, size);
  const s = size / (CHUNK_SIZE * QUANT);
  for (const a of data.areas) {
    g.fillStyle = AREA_COLORS[AREA_KINDS[a.k]] ?? BASE_GROUND;
    g.beginPath();
    for (const r of a.r) {
      g.moveTo(r[0] * s, r[1] * s);
      for (let i = 2; i < r.length; i += 2) g.lineTo(r[i] * s, r[i + 1] * s);
      g.closePath();
    }
    g.fill('evenodd');
  }
  // Subtle deterministic mottling so large open ground is not a flat colour (decorative only).
  let seed = (data.cx * 73856093) ^ (data.cz * 19349663);
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const dots = size * 3;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
    const r = 1 + rnd() * (size / 90);
    g.fillRect(rnd() * size, rnd() * size, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Terrain mesh for a chunk. Vertex heights come from the global height grid. */
export function buildTerrain(data: ChunkData, ctx: BuildContext): THREE.Mesh {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  let xz: number[];
  let index: number[];
  if (data.terrain) {
    xz = data.terrain.p.map((v) => v / QUANT);
    index = data.terrain.i;
  } else {
    const n = CHUNK_SIZE / CELL;
    xz = [];
    index = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) xz.push(i * CELL, j * CELL);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, c = d + 1;
        index.push(a, d, c, a, c, b);
      }
  }
  const count = xz.length / 2;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = xz[i * 2], z = xz[i * 2 + 1];
    pos[i * 3] = x;
    pos[i * 3 + 1] = ctx.height.sample(ox + x, oz + z);
    pos[i * 3 + 2] = z;
    uv[i * 2] = x / CHUNK_SIZE;
    uv[i * 2 + 1] = z / CHUNK_SIZE;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = ctx.mats.terrain(groundTexture(data, ctx.detail === 'high' ? ctx.quality.groundTex : 128));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.ownMaterial = true;
  return mesh;
}
