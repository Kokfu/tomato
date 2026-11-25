import * as THREE from 'three';
import { CHUNK_SIZE, QUANT } from '../config.ts';
import type { ChunkData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { stationOf } from './mainBazaar.ts';
import { PROM_BAND, PROM_COPING, PROM_MEDALLION, PROM_REACH, RAIL_POST, RAIL_RING, TOWER_APRON, offsetRing, promenadeWalk, squareTowerRing } from './promenade.ts';

// N1-M5 meshes of the Kuching Waterfront promenade (see promenade.ts for what is real and what is approximate).
// Everything goes into meshes the chunk already has: the paving road layer and the structure mesh. No new draw call.

const UP: [number, number, number] = [0, 1, 0];
const c = new THREE.Color();
// Paving tints (multiplied by the paving photograph and its 0.6 m joints in the shader).
const FIELD = [0x8c5e4c, 0x84574a, 0x946652], GRANITE = 0xb5afa2, DARK = 0x5f443a, CREAM = 0xc9bb9b;
const IRON = new THREE.Color(0x232d2c);

/** The paved riverside walk and the apron round the Square Tower, laid on the terrain into the paving road layer. */
export function buildPromenadePaving(data: ChunkData, ctx: BuildContext, paving: GeoBuf): void {
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const inside = (x: number, z: number) => x >= ox && x < ox + CHUNK_SIZE && z >= oz && z < oz + CHUNK_SIZE;
  const Y = (x: number, z: number, lift: number) => ctx.height.sample(x, z) + lift;
  const v = (x: number, z: number, lift: number) => paving.vert(x - ox, Y(x, z, lift), z - oz, ...UP, c);
  const quad = (a: [number, number], b: [number, number], d: [number, number], e: [number, number], lift: number) => {
    const i0 = v(a[0], a[1], lift), i1 = v(b[0], b[1], lift), i2 = v(d[0], d[1], lift), i3 = v(e[0], e[1], lift);
    paving.triUp(i0, i1, i2); paving.triUp(i0, i2, i3);
  };
  for (const run of promenadeWalk(data)) {
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i];
      if (!inside((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      const at = (n: typeof a, d: number): [number, number] => [n.x + n.nx * d, n.z + n.nz * d];
      const strip = (d0a: number, d1a: number, d0b: number, d1b: number, hex: number, tone = 1, lift = 0.05) => { c.setHex(hex).multiplyScalar(tone); quad(at(a, d0a), at(a, d1a), at(b, d1b), at(b, d0b), lift); };
      // coping under the railing, the field in bays, a border band on the landward edge
      strip(-0.18, PROM_COPING, -0.18, PROM_COPING, GRANITE, 0.96);
      const bay = Math.floor(a.s / PROM_BAND), next = (bay + 1) * PROM_BAND;
      strip(a.w - 0.45, a.w, b.w - 0.45, b.w, GRANITE, 0.88);
      if (next < b.s) {
        // a bay line falls inside this piece: the field changes tone there, under a granite band across the walk
        const t = (next - a.s) / (b.s - a.s), tx = (b.x - a.x) / (b.s - a.s), tz = (b.z - a.z) / (b.s - a.s);
        const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t, nx = a.nx + (b.nx - a.nx) * t, nz = a.nz + (b.nz - a.nz) * t, w = a.w + (b.w - a.w) * t;
        const q = (d: number, o: number): [number, number] => [px + nx * d + tx * o, pz + nz * d + tz * o];
        c.setHex(FIELD[bay % FIELD.length]); quad(at(a, PROM_COPING), at(a, a.w - 0.45), q(w - 0.45, 0), q(PROM_COPING, 0), 0.05);
        c.setHex(FIELD[(bay + 1) % FIELD.length]); quad(q(PROM_COPING, 0), q(w - 0.45, 0), at(b, b.w - 0.45), at(b, PROM_COPING), 0.05);
        c.setHex(GRANITE).multiplyScalar(0.92);
        quad(q(PROM_COPING, -0.25), q(w - 0.45, -0.25), q(w - 0.45, 0.25), q(PROM_COPING, 0.25), 0.058);
      } else strip(PROM_COPING, a.w - 0.45, PROM_COPING, b.w - 0.45, FIELD[bay % FIELD.length]);
      // medallion: rings of setts, standing in for the real swirl mosaics
      if (Math.floor(a.s / PROM_MEDALLION) !== Math.floor(b.s / PROM_MEDALLION) && Math.min(a.w, b.w) > 6.5) {
        const [mx, mz] = at(b, b.w / 2), R = Math.min(2.3, b.w / 2 - 0.9), N = 20;
        const rings: [number, number, number][] = [[R, R * 0.82, GRANITE], [R * 0.82, R * 0.5, DARK], [R * 0.5, R * 0.22, CREAM], [R * 0.22, 0, FIELD[0]]];
        for (const [r1, r0, hex] of rings) for (let k = 0; k < N; k++) {
          const u0 = (k / N) * Math.PI * 2, u1 = ((k + 1) / N) * Math.PI * 2;
          c.setHex(hex).multiplyScalar(k % 2 ? 0.93 : 1);
          const p = (r: number, u: number): [number, number] => [mx + Math.cos(u) * r, mz + Math.sin(u) * r];
          if (r0 > 0) quad(p(r1, u0), p(r1, u1), p(r0, u1), p(r0, u0), 0.062);
          else { const i0 = v(mx, mz, 0.062), i1 = v(...p(r1, u0), 0.062), i2 = v(...p(r1, u1), 0.062); paving.triUp(i0, i1, i2); }
        }
      }
    }
  }
  // Square Tower forecourt: a paved apron round the mapped outline with a granite edge.
  const tower = squareTowerRing(data);
  if (tower) {
    const mid = offsetRing(tower, TOWER_APRON - 0.4), outer = offsetRing(tower, TOWER_APRON), n = tower.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, P = (r: number[], k: number): [number, number] => [r[k * 2], r[k * 2 + 1]];
      c.setHex(FIELD[1]); quad(P(tower, i), P(tower, j), P(mid, j), P(mid, i), 0.05);
      c.setHex(GRANITE).multiplyScalar(0.9); quad(P(mid, i), P(mid, j), P(outer, j), P(outer, i), 0.05);
    }
  }
}

/** True where the M5 railing replaces the plain three-bar one (the stretch of bank that carries the paved walk). */
export function ringRailingAt(x: number, z: number): boolean { return stationOf(x, z).d <= PROM_REACH; }

/**
 * Cast-iron railing with ring panels along one bank line (chunk-local metres): posts with caps, a top rail, a frieze
 * rail and a bottom rail, and rings between the two lower rails. `rings` is off on the low preset.
 */
export function ringRailing(buf: GeoBuf, line: number[], y: (x: number, z: number) => number, rings: boolean): void {
  let acc = 0, post = 0, ring = RAIL_RING / 2;
  const vq = (ax: number, ay0: number, ay1: number, az: number, bx: number, by0: number, by1: number, bz: number) => {
    const nx = -(bz - az), nz = bx - ax, l = Math.hypot(nx, nz) || 1;
    const i0 = buf.vert(ax, ay0, az, nx / l, 0, nz / l, IRON), i1 = buf.vert(bx, by0, bz, nx / l, 0, nz / l, IRON);
    const i2 = buf.vert(bx, by1, bz, nx / l, 0, nz / l, IRON), i3 = buf.vert(ax, ay1, az, nx / l, 0, nz / l, IRON);
    buf.tri(i0, i1, i2); buf.tri(i0, i2, i3);
  };
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2] / QUANT, az = line[i - 1] / QUANT, bx = line[i] / QUANT, bz = line[i + 1] / QUANT;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, ya = y(ax, az), yb = y(bx, bz);
    for (const [lo, hi] of [[1.03, 1.1], [0.84, 0.87], [0.14, 0.18]]) vq(ax, ya + lo, ya + hi, az, bx, yb + lo, yb + hi, bz);
    for (; post <= acc + len; post += RAIL_POST) {
      const t = (post - acc) / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = ya + (yb - ya) * t;
      vq(x - dx * 0.05, h, h + 1.16, z - dz * 0.05, x + dx * 0.05, h, h + 1.16, z + dz * 0.05);
      vq(x + dz * 0.05, h, h + 1.16, z - dx * 0.05, x - dz * 0.05, h, h + 1.16, z + dx * 0.05);
      // cap
      vq(x - dx * 0.08, h + 1.16, h + 1.24, z - dz * 0.08, x + dx * 0.08, h + 1.16, h + 1.24, z + dz * 0.08);
      vq(x + dz * 0.08, h + 1.16, h + 1.24, z - dx * 0.08, x - dz * 0.08, h + 1.16, h + 1.24, z + dx * 0.08);
    }
    if (rings) for (; ring <= acc + len; ring += RAIL_RING) {
      const t = (ring - acc) / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = ya + (yb - ya) * t + 0.51;
      const N = 8, r1 = 0.3, r0 = 0.268, nx = -dz, nz = dx;
      for (let k = 0; k < N; k++) {
        const u0 = ((k + 0.5) / N) * Math.PI * 2, u1 = ((k + 1.5) / N) * Math.PI * 2;
        const p = (r: number, u: number) => buf.vert(x + dx * Math.cos(u) * r, h + Math.sin(u) * r, z + dz * Math.cos(u) * r, nx, 0, nz, IRON);
        const i0 = p(r1, u0), i1 = p(r1, u1), i2 = p(r0, u1), i3 = p(r0, u0);
        buf.tri(i0, i1, i2); buf.tri(i0, i2, i3);
      }
    }
    acc += len;
  }
}
