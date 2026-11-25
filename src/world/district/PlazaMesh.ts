import * as THREE from 'three';
import { CHUNK_SIZE } from '../config.ts';
import type { ChunkData } from '../types.ts';
import type { GeoBuf } from '../Materials.ts';
import type { BuildContext } from '../ChunkManager.ts';
import { PORTAL, plazaEntrance, plazaProps } from './plazaMerdeka.ts';

// N1-M5 mesh of the Plaza Merdeka entrance (see plazaMerdeka.ts: all of it is approximate). Paving goes into the
// paving road layer, everything else into the structure mesh of the chunk that holds the mall. No new draw call.

const c = new THREE.Color();
const FRAME = 0xf1efe8, GLASS = 0x22323c, DOOR = 0x3b5563, MULLION = 0xc9ccd0, GRANITE = 0xb5afa2, CREAM = 0xd6ccb4, DARK = 0x6b675f;

export function buildPlazaEntrance(data: ChunkData, ctx: BuildContext, paved: GeoBuf, solid: GeoBuf): void {
  const e = plazaEntrance(data);
  if (!e) return;
  const ox = data.cx * CHUNK_SIZE, oz = data.cz * CHUNK_SIZE, low = ctx.quality.name === 'low';
  // entrance frame: a along the face, o outward; g = the highest ground under the portal (the floor level)
  const W = (a: number, o: number): [number, number] => [e.x + e.ex * a + e.nx * o, e.z + e.ez * a + e.nz * o];
  let g = -Infinity;
  for (const a of [-PORTAL.half, 0, PORTAL.half]) for (const o of [0, PORTAL.canopyOut]) { const [x, z] = W(a, o); g = Math.max(g, ctx.height.sample(x, z)); }
  g += 0.08;
  const P = (a: number, o: number, y: number): [number, number, number] => { const [x, z] = W(a, o); return [x - ox, y, z - oz]; };
  const quad = (p: [number, number, number][], n: [number, number, number]) => {
    const i = p.map((q) => solid.vert(q[0], q[1], q[2], n[0], n[1], n[2], c));
    solid.tri(i[0], i[1], i[2]); solid.tri(i[0], i[2], i[3]);
  };
  const N: [number, number, number] = [e.nx, 0, e.nz], E: [number, number, number] = [e.ex, 0, e.ez], UP: [number, number, number] = [0, 1, 0];
  /** Box in the entrance frame: sides facing out and along, and a top. */
  const box = (a0: number, a1: number, o0: number, o1: number, y0: number, y1: number, top = true) => {
    quad([P(a0, o1, y0), P(a1, o1, y0), P(a1, o1, y1), P(a0, o1, y1)], N);
    quad([P(a0, o0, y0), P(a0, o1, y0), P(a0, o1, y1), P(a0, o0, y1)], [-E[0], 0, -E[2]]);
    quad([P(a1, o1, y0), P(a1, o0, y0), P(a1, o0, y1), P(a1, o1, y1)], E);
    quad([P(a1, o0, y0), P(a0, o0, y0), P(a0, o0, y1), P(a1, o0, y1)], [-N[0], 0, -N[2]]);
    if (top) quad([P(a0, o0, y1), P(a1, o0, y1), P(a1, o1, y1), P(a0, o1, y1)], UP);
  };
  const pane = (a0: number, a1: number, o: number, y0: number, y1: number) => quad([P(a0, o, y0), P(a1, o, y0), P(a1, o, y1), P(a0, o, y1)], N);
  const H = PORTAL.half, D = PORTAL.depth;
  // white frame: two piers and the lintel band that carries the name
  c.setHex(FRAME);
  box(-H, -H + 0.7, -0.1, D, g - 0.6, g + PORTAL.top, false);
  box(H - 0.7, H, -0.1, D, g - 0.6, g + PORTAL.top, false);
  box(-H, H, -0.1, D, g + PORTAL.lintel, g + PORTAL.top);
  // glazing with mullions, two pairs of doors
  c.setHex(GLASS); pane(-H + 0.7, H - 0.7, 0.14, g, g + PORTAL.lintel);
  c.setHex(MULLION);
  if (!low) for (let k = 1; k < 6; k++) { const a = -H + 0.7 + ((2 * H - 1.4) * k) / 6; pane(a - 0.04, a + 0.04, 0.17, g, g + PORTAL.lintel); }
  pane(-H + 0.7, H - 0.7, 0.17, g + 2.75, g + 2.87);
  c.setHex(DOOR); for (const a of [-1.55, 0.05]) pane(a, a + 1.5, 0.19, g + 0.05, g + 2.7);
  // canopy slab on two columns
  c.setHex(FRAME).multiplyScalar(0.97);
  box(-H + 0.4, H - 0.4, D, PORTAL.canopyOut, g + PORTAL.canopyY, g + PORTAL.canopyY + 0.22);
  c.setHex(FRAME).multiplyScalar(0.8);
  quad([P(-H + 0.4, D, g + PORTAL.canopyY), P(H - 0.4, D, g + PORTAL.canopyY), P(H - 0.4, PORTAL.canopyOut, g + PORTAL.canopyY), P(-H + 0.4, PORTAL.canopyOut, g + PORTAL.canopyY)], [0, -1, 0]);
  for (const p of plazaProps()) {
    const [x, z] = W(p.a, p.o), y = ctx.height.sample(x, z);
    if (p.kind === 'column') { c.setHex(FRAME).multiplyScalar(0.93); box(p.a - p.ha, p.a + p.ha, p.o - p.ho, p.o + p.ho, y - 0.3, g + PORTAL.canopyY, false); }
    else if (p.kind === 'bollard') { c.setHex(0x3b3f44); box(p.a - p.ha, p.a + p.ha, p.o - p.ho, p.o + p.ho, y, y + p.h); }
    else {
      c.setHex(0xa9a59b); box(p.a - p.ha, p.a + p.ha, p.o - p.ho, p.o + p.ho, y - 0.2, y + p.h);
      c.setHex(0x3f7a3d); box(p.a - p.ha + 0.1, p.a + p.ha - 0.1, p.o - p.ho + 0.1, p.o + p.ho - 0.1, y + p.h, y + p.h + 0.5);
    }
  }
  // forecourt: granite bands and cream bays, laid on the terrain
  const F = PORTAL.forecourtHalf, S = 6, v = (a: number, o: number) => { const [x, z] = W(a, o); return paved.vert(x - ox, ctx.height.sample(x, z) + 0.07, z - oz, 0, 1, 0, c); };
  for (let k = 0; k < S; k++) for (const [o0, o1, hex] of [[0, 0.4, DARK], [0.4, PORTAL.forecourt / 2, k % 2 ? CREAM : GRANITE], [PORTAL.forecourt / 2, PORTAL.forecourt - 0.4, k % 2 ? GRANITE : CREAM], [PORTAL.forecourt - 0.4, PORTAL.forecourt, DARK]] as [number, number, number][]) {
    const a0 = -F + (2 * F * k) / S, a1 = -F + (2 * F * (k + 1)) / S;
    c.setHex(hex);
    const i0 = v(a0, o0), i1 = v(a1, o0), i2 = v(a1, o1), i3 = v(a0, o1);
    paved.triUp(i0, i1, i2); paved.triUp(i0, i2, i3);
  }
  // a path from the forecourt out to the mapped drop-off lane (what lies under a carriageway stays hidden under it)
  c.setHex(CREAM);
  for (const [o0, o1] of [[PORTAL.forecourt, PORTAL.forecourt + 2.5], [PORTAL.forecourt + 2.5, PORTAL.forecourt + 5]]) {
    const i0 = v(-2.6, o0), i1 = v(2.6, o0), i2 = v(2.6, o1), i3 = v(-2.6, o1);
    paved.triUp(i0, i1, i2); paved.triUp(i0, i2, i3);
  }
}
