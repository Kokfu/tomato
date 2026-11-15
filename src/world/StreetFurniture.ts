import * as THREE from 'three';
import { v5Exclusion } from '../v5/geo.ts';
import { CHUNK_SIZE, QUANT } from './config.ts';
import type { ChunkData } from './types.ts';
import { FURN } from './types.ts';
import { GeoBuf } from './Materials.ts';
import type { BuildContext } from './ChunkManager.ts';
import { stationOf } from './district/mainBazaar.ts';

// Lamp posts, traffic signals, street-sign posts, benches and bollards, merged into one mesh per
// chunk (plus one tiny unlit mesh for lamp heads and signal lenses). Positions come from
// tools/generate-world/build-streetscape.ts; see there for what is mapped and what is inferred.

const POLE = new THREE.Color(0x4b4f52);
const POLE_LIGHT = new THREE.Color(0x8d9193);
const TIMBER = new THREE.Color(0x7a5a3c);
const CONCRETE = new THREE.Color(0xa7a399);
const HOUSING = new THREE.Color(0x1f2123);
const WHITE = new THREE.Color(0xffffff);
const tmp = new THREE.Color();

/** Box centred at (x, z) in the frame rotated by `a` about +Y; lx along the local X, lz along local Z. */
function box(buf: GeoBuf, x: number, y0: number, y1: number, z: number, a: number, lx0: number, lx1: number, lz0: number, lz1: number, c: THREE.Color): void {
  const ca = Math.cos(a), sa = Math.sin(a);
  const P = (lx: number, lz: number): [number, number] => [x + lx * ca + lz * sa, z - lx * sa + lz * ca];
  const c00 = P(lx0, lz0), c10 = P(lx1, lz0), c11 = P(lx1, lz1), c01 = P(lx0, lz1);
  const side = (p: [number, number], q: [number, number], nx: number, nz: number) => {
    const wx = nx * ca + nz * sa, wz = -nx * sa + nz * ca;
    const i = buf.vert(p[0], y0, p[1], wx, 0, wz, c), j = buf.vert(q[0], y0, q[1], wx, 0, wz, c);
    const k = buf.vert(q[0], y1, q[1], wx, 0, wz, c), l = buf.vert(p[0], y1, p[1], wx, 0, wz, c);
    // Wind toward the normal.
    const ux = q[0] - p[0], uz = q[1] - p[1];
    if (-(y1 - y0) * uz * wx + (y1 - y0) * ux * wz >= 0) { buf.tri(i, j, k); buf.tri(i, k, l); } else { buf.tri(i, k, j); buf.tri(i, l, k); }
  };
  side(c00, c10, 0, -1); side(c10, c11, 1, 0); side(c11, c01, 0, 1); side(c01, c00, -1, 0);
  for (const [y, ny] of [[y1, 1], [y0, -1]] as const) {
    const i = buf.vert(c00[0], y, c00[1], 0, ny, 0, c), j = buf.vert(c10[0], y, c10[1], 0, ny, 0, c);
    const k = buf.vert(c11[0], y, c11[1], 0, ny, 0, c), l = buf.vert(c01[0], y, c01[1], 0, ny, 0, c);
    if (ny > 0) { buf.triUp(i, j, k); buf.triUp(i, k, l); } else { buf.triUp(i, j, k); buf.triUp(i, k, l); const n = buf.idx.length; for (const o of [n - 6, n - 3]) { const t = buf.idx[o + 1]; buf.idx[o + 1] = buf.idx[o + 2]; buf.idx[o + 2] = t; } }
  }
}

export function buildFurniture(data: ChunkData, ctx: BuildContext): THREE.Object3D[] {
  const furn = data.furn;
  if (!furn?.length) return [];
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const solid = new GeoBuf(), glow = new GeoBuf();
  for (let i = 0; i < furn.length; i += 5) {
    const x = furn[i + 1] / QUANT, z = furn[i + 2] / QUANT, a = (furn[i + 3] * Math.PI) / 180;
    if (v5Exclusion.active && v5Exclusion.inCorridor(data.cx * CHUNK_SIZE + x, data.cz * CHUNK_SIZE + z)) continue;
    const y = ctx.height.sample(ox + x, oz + z);
    switch (furn[i]) {
      case FURN.lamp: {
        // The district draws its own median and promenade lamps (district/Dressing.ts).
        if (stationOf(ox + x, oz + z).d < 16) break;
        // Tapered steel column with a single arm reaching over the carriageway (local +Z).
        box(solid, x, y - 0.2, y + 0.5, z, a, -0.11, 0.11, -0.11, 0.11, POLE);
        box(solid, x, y + 0.5, y + 6.2, z, a, -0.06, 0.06, -0.06, 0.06, POLE_LIGHT);
        box(solid, x, y + 6.1, y + 6.2, z, a, -0.04, 0.04, 0, 1.3, POLE_LIGHT);
        box(solid, x, y + 6.02, y + 6.12, z, a, -0.14, 0.14, 1.0, 1.6, POLE);
        box(glow, x, y + 5.98, y + 6.02, z, a, -0.11, 0.11, 1.05, 1.55, WHITE);
        break;
      }
      case FURN.signal: {
        box(solid, x, y - 0.2, y + 3.5, z, a, -0.07, 0.07, -0.07, 0.07, POLE);
        box(solid, x, y + 2.55, y + 3.55, z, a, -0.17, 0.17, 0.07, 0.3, HOUSING);
        // Lenses face along local +Z (toward approaching traffic).
        const lens: [number, number][] = [[0xd23a2e, 3.22], [0xe0a52e, 2.92], [0x3fae5a, 2.62]];
        for (const [hex, ly] of lens) box(glow, x, y + ly, y + ly + 0.2, z, a, -0.1, 0.1, 0.3, 0.32, tmp.setHex(hex).multiplyScalar(0.75).clone());
        break;
      }
      case FURN.sign:
        box(solid, x, y - 0.2, y + 2.75, z, a, -0.04, 0.04, -0.04, 0.04, POLE_LIGHT);
        break;
      case FURN.bench:
        box(solid, x, y + 0.4, y + 0.47, z, a, -0.8, 0.8, -0.22, 0.22, TIMBER);
        box(solid, x, y + 0.5, y + 0.9, z, a, -0.8, 0.8, -0.26, -0.21, TIMBER);
        box(solid, x, y, y + 0.4, z, a, -0.72, -0.64, -0.2, 0.2, CONCRETE);
        box(solid, x, y, y + 0.4, z, a, 0.64, 0.72, -0.2, 0.2, CONCRETE);
        break;
      case FURN.bollard:
        box(solid, x, y - 0.1, y + 0.9, z, a, -0.08, 0.08, -0.08, 0.08, CONCRETE);
        break;
    }
  }
  const out: THREE.Object3D[] = [];
  const sg = solid.build();
  if (sg) {
    const m = new THREE.Mesh(sg, ctx.mats.furniture);
    m.castShadow = true;
    m.receiveShadow = true;
    out.push(m);
  }
  const gg = glow.build();
  if (gg) out.push(new THREE.Mesh(gg, ctx.mats.lampGlow));
  return out;
}
