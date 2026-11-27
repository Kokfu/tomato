// N1-M5 hero place 5: the Cat Column, the Great Cat of Kuching and the Kuching Chinatown Paifang (Jalan Padungan).
// Procedural models. What is real, what is a verified form and what is approximate: src/world/district/padungan.ts
// and docs/night/m5-padungan-cat-statue.md. Registered only when the m5 flag is on (landmarks/index.ts), so `?m5=0`
// keeps the N1-M4 rendering (the gate as a generic block, no statues).
import type * as THREE from 'three';
import type { LandmarkBuilder } from '../LandmarkManager.ts';
import { CHUNK_SIZE } from '../config.ts';
import { CAT, CAT_COLUMN, COLUMN, GATE, GREAT_CAT, paifang } from '../district/padungan.ts';
import { Model, col, type V3 } from './kit.ts';

const WHITE = col(0xf4f2ec), WHITE_2 = col(0xdedbd2), EYE = col(0x2a2d33);
const PLINTH = col(0x5b6068), DRUM = col(0x8b9198), SHAFT = col(0x9aa0a8), SHAFT_2 = col(0x8a9099);
const LEAF = col(0x1f7a4d), FLOWER = col(0xc8202a), GOLD = col(0xd9b23a), BLUE = col(0x24418f);
const PIER = col(0xdba892), PIER_2 = col(0xc98f7c), BASE = col(0x8e3b35), BEAM = col(0xc8504a), CREAM = col(0xeee3c2);
const PANEL = col(0x4b2e26), TEAL = col(0x2d5a57), CHEVRON = col(0x2f6f8f), TILE = col(0x4d5a66), TILE_2 = col(0x3c4650), EAVE = col(0xd9cfa0);
const SHRUB = [col(0x3f7a3d), col(0x4f8f45), col(0x356b38)], BED = col(0x58823f), PAVE = col(0xb9a888), FRAME = col(0xc23a3a);
const KERB = [col(0xf0efe9), col(0x1d1e20)];

/** A cat sitting upright, `h` metres tall, at the origin of the model's current frame, facing +a. */
function cat(m: Model, y: number, h: number, paw: boolean): void {
  const P = (a: number, yy: number, b: number): V3 => [a * h, y + yy * h, b * h];
  const L = (a: number, b: number, prof: [number, number][], n: number, c: THREE.Color) => m.lathe(a * h, b * h, prof.map(([r, yy]) => [r * h, y + yy * h]), n, c);
  L(-0.04, 0, [[0.2, 0], [0.27, 0.1], [0.26, 0.28], [0.2, 0.46], [0.14, 0.6], [0.1, 0.66]], 10, WHITE);
  for (const s of [-1, 1]) L(-0.02, s * 0.17, [[0.12, 0], [0.14, 0.08], [0.11, 0.2], [0, 0.26]], 6, WHITE_2);
  L(0.02, 0, [[0.07, 0.645], [0.13, 0.7], [0.155, 0.78], [0.13, 0.86], [0.07, 0.915], [0, 0.93]], 8, WHITE);
  for (const s of [-1, 1]) m.tube(P(0.02, 0.88, s * 0.085), P(0.02, 1.0, s * 0.115), 0.05 * h, 0, 4, WHITE_2);
  m.tube(P(0.12, 0.76, 0), P(0.19, 0.75, 0), 0.06 * h, 0.035 * h, 6, WHITE_2, true);
  for (const s of [-1, 1]) m.poly([P(0.158, 0.79, s * 0.05 - 0.016), P(0.158, 0.79, s * 0.05 + 0.016), P(0.15, 0.825, s * 0.05 + 0.016), P(0.15, 0.825, s * 0.05 - 0.016)], EYE, P(0, 0.8, 0));
  m.tube(P(0.17, 0, 0.09), P(0.13, 0.44, 0.09), 0.06 * h, 0.055 * h, 6, WHITE);
  if (paw) m.tube(P(0.12, 0.46, -0.1), P(0.27, 0.62, -0.1), 0.055 * h, 0.05 * h, 6, WHITE, true);
  else m.tube(P(0.17, 0, -0.09), P(0.13, 0.44, -0.09), 0.06 * h, 0.055 * h, 6, WHITE);
  m.tube(P(-0.26, 0.045, 0), P(-0.04, 0.045, 0.31), 0.045 * h, 0.03 * h, 5, WHITE_2, true);
}

/** Flat ring or disc facing up (chunk-local frame). */
function disc(m: Model, ca: number, cb: number, r0: number, r1: number, y: number, n: number, c: THREE.Color): void {
  for (let k = 0; k < n; k++) {
    const u0 = (k / n) * Math.PI * 2, u1 = ((k + 1) / n) * Math.PI * 2;
    const p = (r: number, u: number): V3 => [ca + Math.cos(u) * r, y, cb + Math.sin(u) * r];
    if (r0 < 1e-6) m.poly([p(r1, u0), p(r1, u1), [ca, y, cb]], c);
    else m.poly([p(r0, u0), p(r1, u0), p(r1, u1), p(r0, u1)], c);
  }
}

/** A clipped shrub: a low dome. */
function shrub(m: Model, a: number, b: number, y: number, r: number, c: THREE.Color): void {
  m.lathe(a, b, [[r, y], [r * 0.95, y + r * 0.55], [r * 0.6, y + r * 1.0], [0, y + r * 1.2]], 6, c, a + b);
}

/** The Cat Column on the island at the Jalan Abell junction (tour view 07). */
export const buildCatColumn: LandmarkBuilder = ({ data, ctx }) => {
  if (`${data.cx}_${data.cz}` !== CAT_COLUMN.key) return null;
  const lx = CAT_COLUMN.x - data.cx * CHUNK_SIZE, lz = CAT_COLUMN.z - data.cz * CHUNK_SIZE;
  const g = ctx.height.sample(CAT_COLUMN.x, CAT_COLUMN.z), R = COLUMN.plinthR, r = COLUMN.shaftR;
  const m = new Model().world();
  const y1 = g + COLUMN.plinthH, y2 = y1 + 0.75, top = g + COLUMN.height;
  if (ctx.detail !== 'high') {
    m.lathe(lx, lz, [[R, g - 0.4], [R - 0.1, y1]], 6, PLINTH, Math.PI / 8, false, true);
    m.lathe(lx, lz, [[r, y1], [r, g + 6.6]], 6, SHAFT);
    m.box(lx - 0.62, lx + 0.62, lz - 0.62, lz + 0.62, g + 6.6, top, BLUE);
    for (let k = 0; k < COLUMN.cats; k++) {
      const u = (k / COLUMN.cats) * Math.PI * 2 + Math.PI / 4, d = R - 0.75;
      m.box(lx + Math.cos(u) * d - 0.25, lx + Math.cos(u) * d + 0.25, lz + Math.sin(u) * d - 0.25, lz + Math.sin(u) * d + 0.25, y1, y1 + COLUMN.catH, WHITE);
    }
    return m.mesh(ctx, 'cat-column');
  }
  m.lathe(lx, lz, [[R, g - 0.4], [R, y1 - 0.1], [R - 0.15, y1]], 8, PLINTH, Math.PI / 8, false, true);
  m.lathe(lx, lz, [[0.95, y1], [0.95, y2 - 0.15], [0.7, y2]], 10, DRUM, 0, false, true);
  // shaft, in bands (the real one carries a key-pattern relief)
  const s0 = y2, s1 = g + 5.0, bands: [number, number][] = [];
  for (let k = 0; k <= 6; k++) bands.push([r - 0.02 * (k / 6), s0 + ((s1 - s0) * k) / 6]);
  m.lathe(lx, lz, bands, 10, (k) => (k % 2 ? SHAFT_2 : SHAFT));
  // leaves and flowers at the foot, a white collar, leaves, hibiscus, the gold crown ring
  m.lathe(lx, lz, [[r + 0.16, s0], [r + 0.22, s0 + 0.6], [r + 0.04, s0 + 0.95]], 10, LEAF);
  for (let k = 0; k < 4; k++) { const u = k * Math.PI / 2 + 0.4; m.lathe(lx + Math.cos(u) * (r + 0.16), lz + Math.sin(u) * (r + 0.16), [[0, s0 + 0.75], [0.13, s0 + 0.88], [0, s0 + 1.02]], 5, FLOWER); }
  m.lathe(lx, lz, [[r + 0.02, s1], [r + 0.1, s1 + 0.1], [r + 0.02, s1 + 0.2]], 10, WHITE);
  m.lathe(lx, lz, [[r + 0.02, s1 + 0.2], [r + 0.16, s1 + 0.5], [r + 0.14, s1 + 0.9], [r + 0.04, s1 + 1.0]], 10, LEAF);
  m.lathe(lx, lz, [[r + 0.04, s1 + 1.0], [r + 0.36, s1 + 1.25], [r + 0.3, s1 + 1.5], [r + 0.06, s1 + 1.6]], 8, FLOWER);
  m.lathe(lx, lz, [[r + 0.12, s1 + 1.6], [r + 0.5, s1 + 1.75], [r + 0.5, s1 + 1.95], [r + 0.26, s1 + 2.0]], 8, GOLD);
  for (let k = 0; k < 4; k++) { const u = k * Math.PI / 2 + Math.PI / 4; m.tube([lx + Math.cos(u) * (r + 0.5), s1 + 1.8, lz + Math.sin(u) * (r + 0.5)], [lx + Math.cos(u) * (r + 0.62), s1 + 2.6, lz + Math.sin(u) * (r + 0.62)], 0.09, 0.05, 4, GOLD, true); }
  // the blue block with the arms: a white and red band, a crenellated top
  const h = 0.62, b0 = s1 + 1.98, b1 = top - 0.22;
  m.box(lx - h, lx + h, lz - h, lz + h, b0, b1, BLUE);
  m.box(lx - h - 0.02, lx + h + 0.02, lz - h - 0.02, lz + h + 0.02, b0 + 0.42, b0 + 0.62, WHITE, null);
  m.box(lx - h - 0.03, lx + h + 0.03, lz - h - 0.03, lz + h + 0.03, b0 + 0.49, b0 + 0.55, FLOWER, null);
  m.box(lx - 0.16, lx + 0.16, lz - h - 0.035, lz + h + 0.035, b0 + 0.72, b0 + 0.92, GOLD, null);
  m.box(lx - h - 0.035, lx + h + 0.035, lz - 0.16, lz + 0.16, b0 + 0.72, b0 + 0.92, GOLD, null);
  m.crenels([lx - h, lz - h, lx + h, lz - h, lx + h, lz + h, lx - h, lz + h], b1, 0.22, BLUE, 0.42, 0.14);
  // four white cats on the plinth, facing outwards
  for (let k = 0; k < COLUMN.cats; k++) {
    const u = (k / COLUMN.cats) * Math.PI * 2 + Math.PI / 4, d = R - 0.75;
    m.frame({ cx: lx + Math.cos(u) * d, cz: lz + Math.sin(u) * d, ux: Math.cos(u), uz: Math.sin(u) });
    cat(m, y1, COLUMN.catH, k === 1);
  }
  return m.mesh(ctx, 'cat-column');
};

/** Hipped tile roof with upturned corners over a0..a1 (along the gate) and -hb..hb, eaves at y. */
function tiledRoof(m: Model, a0: number, a1: number, hb: number, y: number, rise: number): void {
  const am = (a0 + a1) / 2, lift = 0.34, hip = Math.min(hb * 0.95, (a1 - a0) / 2 - 0.25), ref: V3 = [am, y - 3, 0];
  const E: V3[] = [[a0, y + lift, -hb], [a1, y + lift, -hb], [a1, y + lift, hb], [a0, y + lift, hb]];
  const M: V3[] = [[am, y, -hb], [a1, y, 0], [am, y, hb], [a0, y, 0]];
  const R0: V3 = [a0 + hip, y + rise, 0], R1: V3 = [a1 - hip, y + rise, 0];
  for (const t of [[E[0], M[0], R0], [M[0], R1, R0], [M[0], E[1], R1], [E[2], M[2], R1], [M[2], R0, R1], [M[2], E[3], R0], [E[1], M[1], R1], [M[1], E[2], R1], [E[3], M[3], R0], [M[3], E[0], R0]]) m.poly(t, TILE, ref);
  // eaves board (cream) and soffit
  const d = 0.2;
  for (const [p, q] of [[E[0], M[0]], [M[0], E[1]], [E[1], M[1]], [M[1], E[2]], [E[2], M[2]], [M[2], E[3]], [E[3], M[3]], [M[3], E[0]]]) m.poly([[p[0], p[1] - d, p[2]], [q[0], q[1] - d, q[2]], q, p], EAVE, [am, y, 0]);
  m.poly([[a0, y - d, -hb], [a1, y - d, -hb], [a1, y - d, hb], [a0, y - d, hb]], TILE_2, [am, y + 1, 0]);
  // ridge crest with raised ends
  m.box(a0 + hip - 0.1, a1 - hip + 0.1, -0.13, 0.13, y + rise - 0.05, y + rise + 0.3, TILE_2);
  for (const a of [a0 + hip - 0.1, a1 - hip + 0.1]) m.box(a - 0.14, a + 0.14, -0.15, 0.15, y + rise + 0.3, y + rise + 0.55, TILE_2);
}

/** The paifang across both carriageways, and the Great Cat on the island in front of it. */
export const buildPaifang: LandmarkBuilder = ({ data, ctx }) => {
  const p = paifang(data);
  if (!p) return null;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE;
  const m = new Model().frame({ cx: p.x - ox, cz: p.z - oz, ux: p.ux, uz: p.uz });
  let g = -Infinity;
  for (const s of p.piers) g = Math.max(g, ctx.height.sample(p.x + p.ux * s, p.z + p.uz * s));
  const [p0, p1, p2, p3] = p.piers, w = GATE.pier / 2, C = GATE.clear;
  if (ctx.detail !== 'high') {
    for (const s of p.piers) m.box(s - w, s + w, -w, w, g - 0.6, g + C, PIER, null);
    m.box(p0 - 0.9, p3 + 0.9, -0.42, 0.42, g + C, g + 9.2, BEAM);
    m.box(p0 - 3.3, p3 + 3.3, -1.9, 1.9, g + 9.2, g + GATE.top, TILE);
    const cx = GREAT_CAT.x - ox, cz = GREAT_CAT.z - oz, cg = ctx.height.sample(GREAT_CAT.x, GREAT_CAT.z);
    m.world();
    disc(m, cx, cz, 0, CAT.bed, cg + 0.16, 8, BED);
    m.box(cx - CAT.plinth, cx + CAT.plinth, cz - CAT.plinth, cz + CAT.plinth, cg + 0.1, cg + 0.18 + CAT.plinthH + CAT.height, WHITE);
    return m.mesh(ctx, 'padungan-paifang');
  }
  for (const s of p.piers) {
    m.box(s - w - 0.16, s + w + 0.16, -w - 0.16, w + 0.16, g - 0.6, g + 1.05, BASE);
    m.box(s - w, s + w, -w, w, g + 1.05, g + C, PIER, null);
    for (const b of [-1, 1]) m.poly([[s - 0.3, g + 1.5, b * (w + 0.02)], [s + 0.3, g + 1.5, b * (w + 0.02)], [s + 0.3, g + C - 0.6, b * (w + 0.02)], [s - 0.3, g + C - 0.6, b * (w + 0.02)]], PIER_2, [s, g + 3, 0]);
    m.box(s - w - 0.06, s + w + 0.06, -w - 0.06, w + 0.06, g + C - 0.28, g + C, BASE, null);
  }
  // painted beam over all four piers: a cream panel over the middle bay, pink panels with blue ends over the others
  m.box(p0 - 0.9, p3 + 0.9, -0.42, 0.42, g + C, g + C + 0.9, BEAM);
  const pane = (a0: number, a1: number, y0: number, y1: number, c: THREE.Color, off: number) => {
    for (const b of [-1, 1]) m.poly([[a0, g + y0, b * off], [a1, g + y0, b * off], [a1, g + y1, b * off], [a0, g + y1, b * off]], c, [(a0 + a1) / 2, g + y0, 0]);
  };
  pane(p1 + w, p2 - w, C + 0.1, C + 0.8, CREAM, 0.44);
  for (const [a0, a1] of [[p0 + w, p1 - w], [p2 + w, p3 - w]]) {
    pane(a0 + 0.9, a1 - 0.9, C + 0.14, C + 0.76, col(0xe27a84), 0.44);
    pane(a0 + 0.1, a0 + 0.8, C + 0.14, C + 0.76, CHEVRON, 0.44);
    pane(a1 - 0.8, a1 - 0.1, C + 0.14, C + 0.76, CHEVRON, 0.44);
  }
  // name panels (dark, gold frame; the inscriptions are not reproduced) and the posts that carry the roofs
  const bays: [number, number, number][] = [[p0, p1, 9.2], [p1, p2, 8.4], [p2, p3, 9.2]];
  for (const [a0, a1, eave] of bays) {
    m.box(a0 - 0.2, a1 + 0.2, -0.3, 0.3, g + C + 0.9, g + eave, TEAL);
    const c0 = (a0 + a1) / 2 - Math.min(2.3, (a1 - a0) / 2 - 1), c1 = (a0 + a1) / 2 + Math.min(2.3, (a1 - a0) / 2 - 1);
    pane(c0 - 0.08, c1 + 0.08, C + 1.12, C + 2.08, GOLD, 0.31);
    pane(c0, c1, C + 1.2, C + 2.0, PANEL, 0.33);
  }
  for (const s of p.piers) m.box(s - 0.32, s + 0.32, -0.32, 0.32, g + C + 0.9, g + 9.2, TEAL, null);
  // roofs: low wings beyond the outer piers, a high roof over each carriageway bay, a lower one over the middle bay
  tiledRoof(m, p0 - 3.3, p0 + 1.7, 1.9, g + 7.3, 1.5);
  tiledRoof(m, p3 - 1.7, p3 + 3.3, 1.9, g + 7.3, 1.5);
  tiledRoof(m, p0 + 0.3, p1 + 0.7, 2.3, g + 9.2, 1.9);
  tiledRoof(m, p2 - 0.7, p3 - 0.3, 2.3, g + 9.2, 1.9);
  tiledRoof(m, p1 - 1.0, p2 + 1.0, 2.05, g + 8.4, 1.6);
  for (const am of [(p0 + p1) / 2 + 0.5, (p2 + p3) / 2 - 0.5]) {
    m.box(am - 1.5, am + 1.5, -0.3, 0.3, g + 11.0, g + GATE.top - 0.3, TILE_2, null);
    m.box(am - 1.75, am + 1.75, -0.5, 0.5, g + GATE.top - 0.3, g + GATE.top, TILE);
  }

  // The Great Cat, facing away from the gate, on a white plinth in a planted bed with a black and white kerb.
  const cx = GREAT_CAT.x - ox, cz = GREAT_CAT.z - oz, cg = ctx.height.sample(GREAT_CAT.x, GREAT_CAT.z);
  m.world();
  const N = 28, R = CAT.bed;
  for (let k = 0; k < N; k++) {
    const u0 = (k / N) * Math.PI * 2, u1 = ((k + 1) / N) * Math.PI * 2, c = KERB[k % 2];
    const q = (r: number, u: number, y: number): V3 => [cx + Math.cos(u) * r, y, cz + Math.sin(u) * r];
    m.poly([q(R, u0, cg - 0.2), q(R, u1, cg - 0.2), q(R, u1, cg + 0.2), q(R, u0, cg + 0.2)], c, [cx, cg, cz]);
    m.poly([q(R - 0.28, u0, cg + 0.2), q(R, u0, cg + 0.2), q(R, u1, cg + 0.2), q(R - 0.28, u1, cg + 0.2)], c);
  }
  disc(m, cx, cz, 2.6, R - 0.28, cg + 0.16, 14, BED);
  disc(m, cx, cz, 0, 2.6, cg + 0.18, 14, PAVE);
  const P = CAT.plinth;
  m.box(cx - P, cx + P, cz - P, cz + P, cg + 0.1, cg + 0.18 + CAT.plinthH, WHITE_2, WHITE);
  for (let k = 0; k < 12; k++) {
    const u = (k / 12) * Math.PI * 2 + 0.2, d = 3.3 + (k % 3) * 0.55;
    shrub(m, cx + Math.cos(u) * d, cz + Math.sin(u) * d, cg + 0.16, 0.5 + (k % 4) * 0.13, SHRUB[k % 3]);
  }
  // the thin red frame that stands round the statue in the photograph
  const F = 2.3, fy = cg + 3.1;
  for (const [a, b] of [[-F, -F], [F, -F], [F, F], [-F, F]]) m.tube([cx + a, cg + 0.18, cz + b], [cx + a, fy, cz + b], 0.045, 0.045, 4, FRAME);
  for (const [a0, b0, a1, b1] of [[-F, -F, F, -F], [F, -F, F, F], [F, F, -F, F], [-F, F, -F, -F]]) m.tube([cx + a0, fy, cz + b0], [cx + a1, fy, cz + b1], 0.04, 0.04, 4, FRAME);
  m.frame({ cx, cz, ux: p.fx, uz: p.fz });
  cat(m, cg + 0.18 + CAT.plinthH, CAT.height, true);
  return m.mesh(ctx, 'padungan-paifang');
};
