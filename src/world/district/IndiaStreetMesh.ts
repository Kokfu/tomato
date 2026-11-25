import * as THREE from 'three';
import { CHUNK_SIZE } from '../config.ts';
import type { ChunkData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { edgeOutward, hash3 } from '../arch/frontage.ts';
import { m5Enabled } from './m5.ts';
import {
  CANOPY_EAVES, CANOPY_INSET, CANOPY_RISE, INDIA_KEY, INDIA_LENGTH, INDIA_SOUTH, POST_R,
  gambierParked, indiaFronts, indiaPosts, indiaSpine, indiaStalls,
} from './indiaStreet.ts';
import type { Parked, SpineNode, Stall } from './indiaStreet.ts';

// N1-M5 meshes of India Street and Jalan Gambier (see indiaStreet.ts for what is real and what is approximate).
// Everything goes into meshes the chunk already has: the paving road layer, the lane-marking mesh (the canopy
// fabric: unlit, so it reads as cloth with the daylight coming through, and it throws no shadow) and the structure
// mesh (steel, stalls, awnings, flags, parked cars). No new draw call, material or shader program.

const c = new THREE.Color();
const UP: [number, number, number] = [0, 1, 0];
// Paving tints (multiplied by the paving photograph and its joints in the shader).
const CREAM = 0xd9cfb6, GREY = 0xa39e94, DARK = 0x6b675f;
const STEEL = 0xe9e9e4, CLOTH = [0xe2574c, 0x3d7fc9, 0xf2c53d, 0x4fae6d, 0xe98ab0, 0xf4f1e8, 0x7b58b0, 0xef8f3a, 0x2f9f9c, 0x243a6b];
const CAR_PAINT = [0xe8e8e4, 0xb9bcc0, 0x6d7176, 0x2a2c30, 0xa3262a, 0x2c4f8a, 0xc9b99a, 0xe8e8e4, 0x8d9499, 0x3f5d48];
const KAPCAI_PAINT = [0xb3262b, 0x1f3f8f, 0x202226, 0xe8e6df, 0x1d6b4a];

export function isIndiaChunk(data: { cx: number; cz: number }): boolean { return m5Enabled() && `${data.cx}_${data.cz}` === INDIA_KEY; }

/** Box on the ground frame (tx, tz): half length ha along it, half width hb across; sides and a top. Chunk-local. */
function box(buf: GeoBuf, x: number, z: number, tx: number, tz: number, ha: number, hb: number, y0: number, y1: number, top = true): void {
  const p = (a: number, b: number): [number, number] => [x + tx * ha * a - tz * hb * b, z + tz * ha * a + tx * hb * b];
  const side = (a: [number, number], b: [number, number], nx: number, nz: number) => {
    const i0 = buf.vert(a[0], y0, a[1], nx, 0, nz, c), i1 = buf.vert(b[0], y0, b[1], nx, 0, nz, c), i2 = buf.vert(b[0], y1, b[1], nx, 0, nz, c), i3 = buf.vert(a[0], y1, a[1], nx, 0, nz, c);
    buf.tri(i0, i1, i2); buf.tri(i0, i2, i3);
  };
  const A = p(-1, -1), B = p(1, -1), C = p(1, 1), D = p(-1, 1);
  side(A, B, tz, -tx); side(B, C, tx, tz); side(C, D, -tz, tx); side(D, A, -tx, -tz);
  if (!top) return;
  const i0 = buf.vert(A[0], y1, A[1], ...UP, c), i1 = buf.vert(B[0], y1, B[1], ...UP, c), i2 = buf.vert(C[0], y1, C[1], ...UP, c), i3 = buf.vert(D[0], y1, D[1], ...UP, c);
  buf.tri(i0, i2, i1); buf.tri(i0, i3, i2);
}
/** Free quad a-b-d-e with one normal (the structure mesh is double sided). */
function quad(buf: GeoBuf, a: number[], b: number[], d: number[], e: number[], n: number[]): void {
  const i0 = buf.vert(a[0], a[1], a[2], n[0], n[1], n[2], c), i1 = buf.vert(b[0], b[1], b[2], n[0], n[1], n[2], c);
  const i2 = buf.vert(d[0], d[1], d[2], n[0], n[1], n[2], c), i3 = buf.vert(e[0], e[1], e[2], n[0], n[1], n[2], c);
  buf.tri(i0, i1, i2); buf.tri(i0, i2, i3);
}

/** Diamond-pattern tile paving between the two frontages, laid on the terrain into the paving road layer. */
function paving(buf: GeoBuf, ox: number, oz: number, ctx: BuildContext): void {
  const sp = indiaSpine();
  type P = [number, number];
  const B = 0.55, LIFT = 0.07, HEART = 0.4;
  const at = (n: SpineNode, d: number): P => [n.x + n.nx * d, n.z + n.nz * d];
  const mix = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const v = (p: P) => buf.vert(p[0] - ox, ctx.height.sample(p[0], p[1]) + LIFT, p[1] - oz, ...UP, c);
  const tri = (hex: number, p: P, q: P, r: P) => { c.setHex(hex); buf.triUp(v(p), v(q), v(r)); };
  const quad4 = (hex: number, p: P, q: P, r: P, s: P) => { c.setHex(hex); const i0 = v(p), i1 = v(q), i2 = v(r), i3 = v(s); buf.triUp(i0, i1, i2); buf.triUp(i0, i2, i3); };
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    // dark bands along both frontages
    quad4(DARK, at(a, 0), at(a, B), at(b, B), at(b, 0));
    quad4(DARK, at(a, a.w - B), at(a, a.w), at(b, b.w), at(b, b.w - B));
    // The field: one grey diamond with a cream heart per two cells (6 m), built quarter by quarter so that no
    // triangle spans the street. q is the node on the bay's middle line, p the node on the bay line.
    const [p, q] = i % 2 === 1 ? [a, b] : [b, a];
    for (const half of [0, 1]) {
      const pE = at(p, half ? p.w - B : B), qE = at(q, half ? q.w - B : B), pM = at(p, p.w / 2), qM = at(q, q.w / 2);
      const h1 = mix(qM, pM, HEART), h2 = mix(qM, qE, HEART);
      tri(CREAM, pE, qE, pM);
      quad4(GREY, pM, h1, h2, qE);
      tri(CREAM, h1, qM, h2);
    }
  }
  // the west mouth, beyond the first node (towards Jalan Gambier and Jalan Power): plain cream
  const a = sp[0];
  quad4(CREAM, [a.x, a.z], [-208.2, -163.8], INDIA_SOUTH[0], at(a, a.w));
}

/** The canopy: white steel columns with branching arms down the middle of the street, fabric vault above. */
function canopy(solid: GeoBuf, fabric: GeoBuf, ox: number, oz: number, ctx: BuildContext, low: boolean): void {
  const sp = indiaSpine().filter((n) => n.s >= CANOPY_INSET - 0.01 && n.s <= INDIA_LENGTH - CANOPY_INSET + 0.01);
  const half = (n: SpineNode) => Math.min(n.w / 2 - 0.8, 6.4);
  const gy = (n: SpineNode) => ctx.height.sample(n.x + n.nx * n.w / 2, n.z + n.nz * n.w / 2);
  const SEG = low ? 4 : 6;
  // cross-section point k of SEG at node n: a shallow vault
  const P = (n: SpineNode, k: number): [number, number, number] => {
    const u = (k / SEG) * 2 - 1, d = n.w / 2 + u * half(n);
    return [n.x + n.nx * d - ox, gy(n) + CANOPY_EAVES + CANOPY_RISE * (1 - u * u), n.z + n.nz * d - oz];
  };
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    for (let k = 0; k < SEG; k++) {
      // panels of white and pale yellow cloth, a little darker towards the eaves
      const tone = 0.9 + 0.1 * (1 - Math.abs((k + 0.5) / SEG * 2 - 1));
      c.setHex(i % 4 === 0 ? 0xf5ebba : 0xfbfaf4).multiplyScalar(tone);
      const p0 = P(a, k), p1 = P(a, k + 1), p2 = P(b, k + 1), p3 = P(b, k);
      const i0 = fabric.vert(...p0, ...UP, c), i1 = fabric.vert(...p1, ...UP, c), i2 = fabric.vert(...p2, ...UP, c), i3 = fabric.vert(...p3, ...UP, c);
      fabric.tri(i0, i1, i2); fabric.tri(i0, i2, i3); fabric.tri(i0, i2, i1); fabric.tri(i0, i3, i2);
    }
    // steel: an eaves tube each side and a ridge tube
    c.setHex(STEEL).multiplyScalar(0.92);
    for (const k of [0, SEG / 2, SEG]) {
      const p = P(a, k), q = P(b, k), y = -0.16;
      quad(solid, [p[0], p[1] + y, p[2]], [q[0], q[1] + y, q[2]], [q[0], q[1] - 0.02, q[2]], [p[0], p[1] - 0.02, p[2]], [a.nx, 0, a.nz]);
    }
    // an arched rib across the street at every node
    if (!low || i % 2 === 0) for (let k = 0; k < SEG; k++) {
      const p = P(b, k), q = P(b, k + 1);
      quad(solid, [p[0], p[1] - 0.2, p[2]], [q[0], q[1] - 0.2, q[2]], [q[0], q[1] - 0.02, q[2]], [p[0], p[1] - 0.02, p[2]], [b.tx, 0, b.tz]);
    }
  }
  // columns: octagonal shaft, four arms up to the vault, a collar
  const all = indiaSpine();
  for (const p of indiaPosts()) {
    const n = all.reduce((m, q) => (Math.abs(q.s - p.s) < Math.abs(m.s - p.s) ? q : m));
    const y0 = ctx.height.sample(p.x, p.z), yTop = y0 + CANOPY_EAVES + CANOPY_RISE - 0.1, yArm = y0 + 6.4, lx = p.x - ox, lz = p.z - oz;
    const N = low ? 6 : 8;
    for (let k = 0; k < N; k++) {
      const u0 = (k / N) * Math.PI * 2, u1 = ((k + 1) / N) * Math.PI * 2, um = (u0 + u1) / 2;
      c.setHex(STEEL).multiplyScalar(0.9 + 0.1 * Math.cos(um - 0.8));
      quad(solid, [lx + Math.cos(u0) * POST_R, y0, lz + Math.sin(u0) * POST_R], [lx + Math.cos(u1) * POST_R, y0, lz + Math.sin(u1) * POST_R],
        [lx + Math.cos(u1) * POST_R * 0.8, yTop, lz + Math.sin(u1) * POST_R * 0.8], [lx + Math.cos(u0) * POST_R * 0.8, yTop, lz + Math.sin(u0) * POST_R * 0.8], [Math.cos(um), 0, Math.sin(um)]);
    }
    c.setHex(STEEL).multiplyScalar(0.82);
    box(solid, lx, lz, n.tx, n.tz, POST_R + 0.1, POST_R + 0.1, y0, y0 + 0.5);
    c.setHex(STEEL).multiplyScalar(0.95);
    const h = half(n) * 0.72;
    for (const [da, db] of [[0, 1], [0, -1], [1, 0.45], [-1, 0.45], [1, -0.45], [-1, -0.45]]) {
      // arm from the shaft up to the vault: across the street, and diagonally along it
      const ex = lx + n.tx * da * 3.2 + n.nx * db * h, ez = lz + n.tz * da * 3.2 + n.nz * db * h, u = (db * h) / half(n);
      const ey = y0 + CANOPY_EAVES + CANOPY_RISE * (1 - u * u) - 0.2;
      const sx = -(ez - lz), sz = ex - lx, sl = Math.hypot(sx, sz) || 1, t = 0.07;
      quad(solid, [lx - (sx / sl) * t, yArm, lz - (sz / sl) * t], [lx + (sx / sl) * t, yArm, lz + (sz / sl) * t], [ex + (sx / sl) * t, ey, ez + (sz / sl) * t], [ex - (sx / sl) * t, ey, ez - (sz / sl) * t], [0, -1, 0]);
      quad(solid, [lx, yArm - t, lz], [lx, yArm + t, lz], [ex, ey + t, ez], [ex, ey - t, ez], [sx / sl, 0, sz / sl]);
    }
  }
}

function stall(buf: GeoBuf, s: Stall, ox: number, oz: number, ctx: BuildContext, low: boolean): void {
  const y = ctx.height.sample(s.x, s.z) + 0.07, x = s.x - ox, z = s.z - oz, { tx, tz } = s;
  const at = (a: number, b: number): [number, number] => [x + tx * a - tz * b, z + tz * a + tx * b];
  if (s.rack) {
    // a garment rail: two end frames, the rail, and the clothes as blocks of colour
    c.setHex(0xb8bcc0);
    for (const a of [-0.95, 0.95]) { const [px, pz] = at(a, 0); box(buf, px, pz, tx, tz, 0.025, 0.025, y, y + 1.72, false); box(buf, px, pz, tx, tz, 0.03, 0.3, y, y + 0.05); }
    box(buf, x, z, tx, tz, 0.95, 0.025, y + 1.66, y + 1.72);
    const n = low ? 3 : 6;
    for (let k = 0; k < n; k++) {
      const [px, pz] = at(-0.78 + (1.56 * (k + 0.5)) / n, 0), hk = hash3(s.h, k, 5);
      c.setHex(CLOTH[hk % CLOTH.length]).multiplyScalar(0.85 + (hk >>> 8) % 16 / 100);
      box(buf, px, pz, tx, tz, 0.78 / n - 0.012, 0.24, y + 0.62 + ((hk >>> 12) % 4) * 0.08, y + 1.62);
    }
  } else {
    // a trestle table under a cloth, with folded textiles stacked on it
    c.setHex(CLOTH[(s.h >>> 10) % CLOTH.length]).multiplyScalar(0.8);
    box(buf, x, z, tx, tz, 0.95, 0.42, y, y + 0.74);
    const n = low ? 2 : 5;
    for (let k = 0; k < n; k++) for (const b of low ? [0] : [-0.2, 0.2]) {
      const [px, pz] = at(-0.76 + (1.52 * (k + 0.5)) / n, b), hk = hash3(s.h, k, b > 0 ? 9 : 4);
      c.setHex(CLOTH[hk % CLOTH.length]).multiplyScalar(0.88 + (hk >>> 8) % 12 / 100);
      box(buf, px, pz, tx, tz, 0.76 / n - 0.02, low ? 0.36 : 0.17, y + 0.74, y + 0.86 + ((hk >>> 12) % 5) * 0.07);
    }
  }
  if (s.parasol) {
    const [px, pz] = at(0.2, 0.75);
    c.setHex(0xd8d8d2); box(buf, px, pz, tx, tz, 0.022, 0.022, y, y + 2.45, false);
    const N = 8, R = 1.35, a0 = CLOTH[(s.h >>> 14) % 6], a1 = (s.h >>> 17) % 2 ? 0xf4f1e8 : a0;
    for (let k = 0; k < N; k++) {
      const u0 = (k / N) * Math.PI * 2, u1 = ((k + 1) / N) * Math.PI * 2, um = (u0 + u1) / 2;
      c.setHex(k % 2 ? a1 : a0);
      const i0 = buf.vert(px, y + 2.5, pz, Math.cos(um) * 0.3, 0.95, Math.sin(um) * 0.3, c);
      const i1 = buf.vert(px + Math.cos(u0) * R, y + 2.1, pz + Math.sin(u0) * R, Math.cos(um) * 0.3, 0.95, Math.sin(um) * 0.3, c);
      const i2 = buf.vert(px + Math.cos(u1) * R, y + 2.1, pz + Math.sin(u1) * R, Math.cos(um) * 0.3, 0.95, Math.sin(um) * 0.3, c);
      buf.tri(i0, i2, i1);
    }
  }
}

/** Awnings over the shopfronts and Malaysian flags on poles (both seen in the photographs; which lot has one is by rule). */
function frontDressing(buf: GeoBuf, data: ChunkData, ox: number, oz: number, ctx: BuildContext, low: boolean): void {
  for (const f of indiaFronts(data)) {
    const n = f.ring.length / 2, j = (f.edge + 1) % n;
    let ground = 0;
    for (let i = 0; i < n; i++) ground += ctx.height.sample(f.ring[i * 2], f.ring[i * 2 + 1]);
    ground /= n;
    const ax = f.ring[f.edge * 2] - ox, az = f.ring[f.edge * 2 + 1] - oz, bx = f.ring[j * 2] - ox, bz = f.ring[j * 2 + 1] - oz;
    const len = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / len, ez = (bz - az) / len, w = len / f.lots;
    const [nx, nz] = edgeOutward(f.ring, f.edge);
    for (let u = 0; u < f.lots; u++) {
      const h = hash3(f.b.id, f.edge * 7 + 2, u), mx = ax + ex * (u + 0.5) * w, mz = az + ez * (u + 0.5) * w;
      if (h % 10 < 6) {
        // a sloping cloth awning from the beam out over the street, in two colours, with a valance
        const y0 = ground + 2.98, out = 1.5, drop = 0.5, hw = w / 2 - 0.28, a0 = CLOTH[(h >>> 4) % 6], a1 = (h >>> 9) % 3 ? 0xf4f1e8 : a0;
        const S = low ? 1 : 4;
        for (let k = 0; k < S; k++) {
          const u0 = -hw + (2 * hw * k) / S, u1 = -hw + (2 * hw * (k + 1)) / S;
          c.setHex(k % 2 ? a1 : a0).multiplyScalar(0.92);
          const p = (a: number, o: number, y: number) => [mx + ex * a + nx * o, y, mz + ez * a + nz * o];
          quad(buf, p(u0, 0.02, y0), p(u1, 0.02, y0), p(u1, out, y0 - drop), p(u0, out, y0 - drop), [nx * 0.3, 0.95, nz * 0.3]);
          if (!low) quad(buf, p(u0, out, y0 - drop), p(u1, out, y0 - drop), p(u1, out, y0 - drop - 0.2), p(u0, out, y0 - drop - 0.2), [nx, 0, nz]);
        }
      }
      if (!low && h % 4 === 1) {
        // Jalur Gemilang on a pole raked out from the fascia; the flag hangs square to the frontage
        const px = ax + ex * (u + 0.12) * w, pz = az + ez * (u + 0.12) * w, y0 = ground + 3.95, L = 1.5, rise = 0.8;
        c.setHex(0xd9d9d4);
        quad(buf, [px, y0 - 0.02, pz], [px, y0 + 0.02, pz], [px + nx * L, y0 + rise + 0.02, pz + nz * L], [px + nx * L, y0 + rise - 0.02, pz + nz * L], [ex, 0, ez]);
        // flag: 0.9 m out along the pole's outer part, 0.46 m deep, hanging below the pole line
        const f0 = 0.5, f1 = 1.4, H = 0.46, N = 14;
        const P = (o: number, d: number) => [px + nx * o, y0 + (rise * o) / L - 0.03 - d, pz + nz * o];
        for (let k = 0; k < N; k++) {
          const top = k < 8, o0 = top ? f0 + (f1 - f0) * 0.5 : f0;
          c.setHex(k % 2 ? 0xf4f2ec : 0xc2262e);
          quad(buf, P(o0, (H * k) / N), P(f1, (H * k) / N), P(f1, (H * (k + 1)) / N), P(o0, (H * (k + 1)) / N), [ex, 0, ez]);
        }
        c.setHex(0x1f2f73);
        quad(buf, P(f0, 0), P(f0 + (f1 - f0) * 0.5, 0), P(f0 + (f1 - f0) * 0.5, (H * 8) / N), P(f0, (H * 8) / N), [ex, 0, ez]);
      }
    }
  }
}

function car(buf: GeoBuf, p: Parked, ox: number, oz: number, ctx: BuildContext): void {
  const y = ctx.height.sample(p.x, p.z) + 0.09, x = p.x - ox, z = p.z - oz, { tx, tz } = p;
  const at = (a: number, b: number): [number, number] => [x + tx * a - tz * b, z + tz * a + tx * b];
  const paint = CAR_PAINT[p.h % CAR_PAINT.length], long = 1.95 + ((p.h >>> 8) % 4) * 0.07;
  c.setHex(paint); box(buf, x, z, tx, tz, long, 0.84, y + 0.26, y + 0.88);
  const [cx, cz] = at(-0.18, 0);
  c.setHex(paint).multiplyScalar(0.96); box(buf, cx, cz, tx, tz, 1.28, 0.78, y + 0.88, y + 1.5);
  // window band: four dark panes a hair proud of the cabin
  c.setHex(0x1c262c);
  for (const [a, b, ha, hb] of [[0, 0.785, 1.1, 0], [0, -0.785, 1.1, 0], [1.285, 0, 0, 0.66], [-1.285, 0, 0, 0.66]]) {
    const [wx, wz] = at(-0.18 + a, b), p = (k: number, yy: number) => [wx + tx * ha * k - tz * hb * k, yy, wz + tz * ha * k + tx * hb * k];
    quad(buf, p(-1, y + 0.98), p(1, y + 0.98), p(1, y + 1.4), p(-1, y + 1.4), ha ? [-tz * Math.sign(b), 0, tx * Math.sign(b)] : [tx * Math.sign(a), 0, tz * Math.sign(a)]);
  }
  c.setHex(0x17181a);
  for (const [a, b] of [[1.25, 0.8], [1.25, -0.8], [-1.25, 0.8], [-1.25, -0.8]]) { const [wx, wz] = at(a, b); box(buf, wx, wz, tx, tz, 0.3, 0.09, y, y + 0.6, false); }
  { const [lx, lz] = at(long + 0.01, 0); c.setHex(0xf0edd6); box(buf, lx, lz, tx, tz, 0.012, 0.7, y + 0.56, y + 0.68, false); }
  { const [lx, lz] = at(-long - 0.01, 0); c.setHex(0xa31d1d); box(buf, lx, lz, tx, tz, 0.012, 0.7, y + 0.58, y + 0.7, false); }
}

/** Three kapcai (underbone motorbikes) nose to the kerb. */
function kapcai(buf: GeoBuf, p: Parked, ox: number, oz: number, ctx: BuildContext): void {
  const y = ctx.height.sample(p.x, p.z) + 0.09, x = p.x - ox, z = p.z - oz;
  // bikes stand across the road's direction
  const tx = -p.tz, tz = p.tx;
  for (let k = -1; k <= 1; k++) {
    const bx = x + p.tx * k * 0.85, bz = z + p.tz * k * 0.85, hk = hash3(p.h, k + 2, 3);
    const at = (a: number): [number, number] => [bx + tx * a, bz + tz * a];
    const p0x = p.tx, p0z = p.tz;
    // wheels, fork and handlebar are single panes (the structure mesh is double sided)
    const pane = (a0: number, a1: number, y0: number, y1: number, hb = 0) => { const p = at(a0), q = at(a1); quad(buf, [p[0] - p0x * hb, y0, p[1] - p0z * hb], [q[0] + p0x * hb, y0, q[1] + p0z * hb], [q[0] + p0x * hb, y1, q[1] + p0z * hb], [p[0] - p0x * hb, y1, p[1] - p0z * hb], hb ? [tx, 0, tz] : [p0x, 0, p0z]); };
    c.setHex(0x151517);
    pane(-0.89, -0.35, y, y + 0.54); pane(0.35, 0.89, y, y + 0.54);
    c.setHex(KAPCAI_PAINT[hk % KAPCAI_PAINT.length]);
    box(buf, bx, bz, tx, tz, 0.5, 0.13, y + 0.3, y + 0.62);
    pane(0.5, 0.62, y + 0.5, y + 0.98);
    c.setHex(0x1b1b1d);
    { const [sx, sz] = at(-0.22); box(buf, sx, sz, tx, tz, 0.36, 0.14, y + 0.62, y + 0.74); }
    pane(0.57, 0.57, y + 0.98, y + 1.03, 0.3);
  }
}

/**
 * Everything of hero place 3 in this chunk. `paved` is the paving road layer, `marks` the lane-marking mesh,
 * `solid` the structure mesh (all chunk-local).
 */
export function buildIndiaStreet(data: ChunkData, ctx: BuildContext, paved: GeoBuf, marks: GeoBuf, solid: GeoBuf): void {
  if (!isIndiaChunk(data)) return;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, low = ctx.quality.name === 'low';
  paving(paved, ox, oz, ctx);
  canopy(solid, marks, ox, oz, ctx, low);
  for (const s of indiaStalls()) stall(solid, s, ox, oz, ctx, low);
  frontDressing(solid, data, ox, oz, ctx, low);
  for (const p of gambierParked(data)) (p.kind === 'car' ? car : kapcai)(solid, p, ox, oz, ctx);
}
